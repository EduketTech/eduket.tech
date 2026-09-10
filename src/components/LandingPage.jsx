import { useState } from "react";
import { useNavigate } from "react-router-dom";
import React from 'react';
import ExamRules from "../utils/ExamRules";


export default function LandingPage() {
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const validPasswords = ["abc123", "xyz456"]; // Replace with your real list

  const handleLogin = () => {
    if (validPasswords.includes(password)) {
      // remove password from list (simulate one-time use)
      navigate("/exam");
    } else {
      alert("Invalid or used password");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">

      <ExamRules />

    </div>
  );
}
