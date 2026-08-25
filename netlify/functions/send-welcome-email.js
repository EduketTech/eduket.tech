// netlify/functions/send-welcome-email.js

/**
 * Eduket OS — Welcome Email Netlify Function
 *
 * Sends registration/welcome emails through Resend.
 *
 * Supported roles:
 * - principal
 * - teacher
 * - student
 * - parent
 *
 * Environment variable required:
 * RESEND_API_KEY
 */

exports.handler = async (event) => {
  // ────────────────────────────────────────────────────────────────────────
  // CORS preflight
  // ────────────────────────────────────────────────────────────────────────

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    };
  }

  // Only POST is supported
  if (event.httpMethod !== 'POST') {
    return respond(405, {
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    // ──────────────────────────────────────────────────────────────────────
    // Parse request
    // ──────────────────────────────────────────────────────────────────────

    let data;

    try {
      data = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('[Welcome Email] Invalid JSON:', parseError);

      return respond(400, {
        success: false,
        error: 'Invalid JSON request body',
      });
    }

    const {
      email,
      displayName,
      role,
      schoolName,
      principalEmail,
      grade,
      subjects,
      dashboardUrl,
    } = data;

    // ──────────────────────────────────────────────────────────────────────
    // Validate email
    // ──────────────────────────────────────────────────────────────────────

    if (!email || typeof email !== 'string') {
      return respond(400, {
        success: false,
        error: 'Email required',
      });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Validate role
    // ──────────────────────────────────────────────────────────────────────

    const supportedRoles = [
      'principal',
      'teacher',
      'student',
      'parent',
    ];

    const normalizedRole = String(role || 'student').toLowerCase();

    if (!supportedRoles.includes(normalizedRole)) {
      return respond(400, {
        success: false,
        error: `Unsupported role: ${role}`,
      });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Prepare email
    // ──────────────────────────────────────────────────────────────────────

    const cfg = roleConfig(
      normalizedRole,
      schoolName,
      grade
    );

    const rows = buildRows({
      displayName,
      email,
      role: normalizedRole,
      schoolName,
      grade,
      subjects,
    });

    const html = buildWelcomeHtml(
      cfg,
      displayName,
      rows,
      dashboardUrl
    );

    // ──────────────────────────────────────────────────────────────────────
    // Sender
    // ──────────────────────────────────────────────────────────────────────

    const senderName = schoolName
      ? `${schoolName} via Eduket OS`
      : 'Eduket OS';

    const fromAddress =
      `${senderName} <notifications@eduket.tech>`;

    // Replies should go to the principal where available.
    // Fallback keeps parent/teacher/student emails functional
    // when principalEmail wasn't supplied.
    const replyToAddress =
      principalEmail ||
      'nextgenskills96@gmail.com';

    console.log('[Welcome Email] Sending:', {
      to: email,
      role: normalizedRole,
      schoolName,
      replyTo: replyToAddress,
    });

    // ──────────────────────────────────────────────────────────────────────
    // Send through Resend
    // ──────────────────────────────────────────────────────────────────────

    const result = await sendViaResend({
      to: email,
      subject: `${cfg.icon} ${cfg.subtitle}`,
      html,
      from: fromAddress,
      replyTo: replyToAddress,
    });

    if (!result.success) {
      console.error('[Welcome Email] Resend failed:', result);

      return respond(502, result);
    }

    console.log(
      '[Welcome Email] Successfully sent:',
      result.id
    );

    return respond(200, result);

  } catch (err) {
    console.error('[Welcome Email] Unexpected error:', err);

    return respond(500, {
      success: false,
      error: err.message || 'Failed to send welcome email',
    });
  }
};


// ════════════════════════════════════════════════════════════════════════════
// RESEND API
// ════════════════════════════════════════════════════════════════════════════

async function sendViaResend({
  to,
  subject,
  html,
  from: fromAddr,
  replyTo,
}) {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    console.error(
      '[Resend] RESEND_API_KEY is not configured'
    );

    return {
      success: false,
      error: 'RESEND_API_KEY not set',
    };
  }

  const payload = {
    from: fromAddr,
    to: [to],
    subject,
    html,
  };

  // Resend expects reply_to.
  if (replyTo) {
    payload.reply_to = replyTo;
  }

  try {
    const res = await fetch(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    let json;

    try {
      json = await res.json();
    } catch {
      json = {};
    }

    if (!res.ok) {
      console.error('[Resend Error]', {
        status: res.status,
        response: json,
      });

      return {
        success: false,
        error:
          json?.message ||
          json?.error ||
          res.statusText ||
          'Resend API error',
        status: res.status,
      };
    }

    return {
      success: true,
      id: json.id,
    };

  } catch (error) {
    console.error('[Resend Network Error]', error);

    return {
      success: false,
      error: error.message || 'Unable to reach Resend',
    };
  }
}


// ════════════════════════════════════════════════════════════════════════════
// ROLE CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

function roleConfig(role, schoolName, grade) {
  const configs = {

    principal: {
      colour: '#7c3aed',
      icon: '🏫',
      subtitle: 'Your school is live on Eduket OS!',
      body:
        `Your school <strong>${escapeHtml(
          schoolName || ''
        )}</strong> has been registered. ` +
        `Invite teachers and students to join.`,
      btn: 'Go to Principal Dashboard',
    },

    teacher: {
      colour: '#059669',
      icon: '📚',
      subtitle: 'Welcome, Teacher!',
      body:
        `You have been set up as a teacher at ` +
        `<strong>${escapeHtml(
          schoolName || ''
        )}</strong>. ` +
        `Start by uploading your first exam.`,
      btn: 'Go to Teacher Dashboard',
    },

    student: {
      colour: '#1d4ed8',
      icon: '🎓',
      subtitle: 'Welcome to Eduket OS!',
      body:
        `You are enrolled at ` +
        `<strong>${escapeHtml(
          schoolName || ''
        )}</strong>` +
        `${grade ? `, Grade ${escapeHtml(grade)}` : ''}. ` +
        `Your exams will appear when teachers upload them.`,
      btn: 'Go to My Exams',
    },

    parent: {
      colour: '#ea580c',
      icon: '👨‍👩‍👧',
      subtitle: 'Welcome to Eduket OS!',
      body:
        `Your parent account has been successfully created ` +
        `on Eduket OS${schoolName
          ? ` for <strong>${escapeHtml(schoolName)}</strong>`
          : ''}. ` +
        `You can now access your parent dashboard and monitor ` +
        `your child's learning journey.`,
      btn: 'Go to Parent Dashboard',
    },
  };

  return configs[role] || configs.student;
}


// ════════════════════════════════════════════════════════════════════════════
// REGISTRATION DETAILS
// ════════════════════════════════════════════════════════════════════════════

function buildRows({
  displayName,
  email,
  role,
  schoolName,
  grade,
  subjects,
}) {
  const row = (label, value) =>
    `<tr>` +
    `<td style="padding:7px 0;color:#6b7280;font-size:13px;width:35%">${escapeHtml(label)}</td>` +
    `<td style="padding:7px 0;font-weight:700;font-size:13px">${value}</td>` +
    `</tr>`;

  let rows = '';

  if (displayName) {
    rows += row(
      'Name',
      escapeHtml(displayName)
    );
  }

  if (email) {
    rows += row(
      'Email',
      escapeHtml(email)
    );
  }

  if (role) {
    rows += row(
      'Role',
      escapeHtml(
        role.charAt(0).toUpperCase() +
        role.slice(1)
      )
    );
  }

  if (schoolName) {
    rows += row(
      'School',
      escapeHtml(schoolName)
    );
  }

  if (grade) {
    rows += row(
      'Grade',
      escapeHtml(grade)
    );
  }

  if (Array.isArray(subjects) && subjects.length) {
    rows += row(
      'Subjects',
      subjects.map(escapeHtml).join(', ')
    );
  }

  return rows;
}


// ════════════════════════════════════════════════════════════════════════════
// HTML EMAIL
// ════════════════════════════════════════════════════════════════════════════

function buildWelcomeHtml(
  cfg,
  name,
  rows,
  dashboard = 'https://eduket.tech'
) {
  const safeName = escapeHtml(name || 'there');
  const safeDashboard = escapeHtml(
    dashboard || 'https://eduket.tech'
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Eduket OS</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f1f5f9;
  font-family:'Segoe UI',Arial,sans-serif;
">

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  style="background:#f1f5f9;padding:40px 16px;"
>
<tr>
<td align="center">

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  style="
    max-width:560px;
    background:#fff;
    border-radius:20px;
    overflow:hidden;
    box-shadow:0 4px 32px rgba(0,0,0,0.08);
  "
>

<!-- HEADER -->
<tr>
<td style="
  background:linear-gradient(
    135deg,
    ${cfg.colour},
    ${cfg.colour}cc
  );
  padding:36px 32px;
  text-align:center;
">

<p style="
  margin:0 0 8px;
  font-size:32px;
">
${cfg.icon}
</p>

<h1 style="
  margin:0;
  font-size:24px;
  font-weight:900;
  color:#fff;
">
Eduket OS
</h1>

<p style="
  margin:8px 0 0;
  font-size:13px;
  color:rgba(255,255,255,0.8);
">
AI-Powered School Assessment Platform
</p>

</td>
</tr>

<!-- BODY -->
<tr>
<td style="padding:32px;">

<p style="
  margin:0 0 4px;
  font-size:11px;
  font-weight:700;
  color:${cfg.colour};
  text-transform:uppercase;
  letter-spacing:1px;
">
${cfg.subtitle}
</p>

<p style="
  margin:8px 0 20px;
  font-size:14px;
  color:#374151;
  line-height:1.7;
">
Hi <strong>${safeName}</strong>, ${cfg.body}
</p>

<!-- DETAILS -->
<div style="
  background:#f8fafc;
  border-radius:12px;
  padding:16px 20px;
  border:1px solid #e2e8f0;
  margin-bottom:28px;
">

<p style="
  margin:0 0 10px;
  font-size:10px;
  font-weight:700;
  color:#94a3b8;
  text-transform:uppercase;
  letter-spacing:1px;
">
Your Registration Details
</p>

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
>
${rows}
</table>

</div>

<!-- BUTTON -->
<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
>
<tr>
<td align="center">

<a
  href="${safeDashboard}"
  target="_blank"
  rel="noopener noreferrer"
  style="
    display:inline-block;
    padding:14px 36px;
    background:${cfg.colour};
    color:#fff;
    font-size:14px;
    font-weight:900;
    text-decoration:none;
    border-radius:12px;
  "
>
${cfg.btn} &rarr;
</a>

</td>
</tr>
</table>

<p style="
  margin:24px 0 0;
  font-size:12px;
  color:#94a3b8;
  text-align:center;
">
If you did not create this account, please ignore this email.
</p>

</td>
</tr>

<!-- FOOTER -->
<tr>
<td style="
  background:#f8fafc;
  padding:16px 32px;
  border-top:1px solid #e2e8f0;
  text-align:center;
">

<p style="
  margin:0;
  font-size:11px;
  color:#94a3b8;
">
&copy; 2026 Nextgen Skills &middot;
Eduket OS &middot;
eduket.tech
</p>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>`;
}


// ════════════════════════════════════════════════════════════════════════════
// CORS
// ════════════════════════════════════════════════════════════════════════════

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization',
  };
}


// ════════════════════════════════════════════════════════════════════════════
// RESPONSE
// ════════════════════════════════════════════════════════════════════════════

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}


// ════════════════════════════════════════════════════════════════════════════
// HTML ESCAPING
// ════════════════════════════════════════════════════════════════════════════

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}