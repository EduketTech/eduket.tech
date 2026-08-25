// utils/groqClient.js
import Groq from "groq-sdk";

// Initialize the client with your key from the .env file
const groq = new Groq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
    dangerouslyAllowBrowser: true // Required since you are calling this from the frontend
});

export async function callGroq(prompt) {
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are an educational assistant. Always respond only with the requested format (e.g., pure JSON). Do not include markdown code blocks or conversational text."
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            model: "openai/gpt-oss-120b", // Use a high-quality model for JSON parsing
            temperature: 0.1, // Low temperature for consistent JSON output
        });

        return chatCompletion.choices[0]?.message?.content || "[]";
    } catch (error) {
        console.error("Groq API error:", error);
        return "[]"; // Return empty array on failure
    }
}