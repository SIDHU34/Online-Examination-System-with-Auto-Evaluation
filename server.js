const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Supabase setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase connected");
} else {
    console.log("Supabase environment variables missing");
}

const PORT = process.env.PORT || 3000;

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    return derived === hash;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function sendJson(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    const url = req.url;
    const method = req.method;

    // Serve static files
    if (method === "GET" && (url === "/" || url === "/login.html")) {
        const filePath = path.join(__dirname, "login.html");
        fs.readFile(filePath, (err, data) => {
            if (err) { sendJson(res, 404, { error: "File not found" }); return; }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }

    if (method === "GET" && url === "/register.html") {
        const filePath = path.join(__dirname, "register.html");
        fs.readFile(filePath, (err, data) => {
            if (err) { sendJson(res, 404, { error: "File not found" }); return; }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }

    if (method === "GET" && url === "/dashboard.html") {
        const filePath = path.join(__dirname, "dashboard.html");
        fs.readFile(filePath, (err, data) => {
            if (err) { sendJson(res, 404, { error: "File not found" }); return; }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }

    if (method === "GET" && url === "/exam.html") {
        const filePath = path.join(__dirname, "exam.html");
        fs.readFile(filePath, (err, data) => {
            if (err) { sendJson(res, 404, { error: "File not found" }); return; }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }

    if (method === "GET" && url === "/results.html") {
        const filePath = path.join(__dirname, "results.html");
        fs.readFile(filePath, (err, data) => {
            if (err) { sendJson(res, 404, { error: "File not found" }); return; }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }

    if (method === "GET" && url === "/profile.html") {
        const filePath = path.join(__dirname, "profile.html");
        fs.readFile(filePath, (err, data) => {
            if (err) { sendJson(res, 404, { error: "File not found" }); return; }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }

    if (method === "GET" && url === "/leaderboard.html") {
        const filePath = path.join(__dirname, "leaderboard.html");
        fs.readFile(filePath, (err, data) => {
            if (err) { sendJson(res, 404, { error: "File not found" }); return; }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }

    if (method === "GET" && url === "/admin.html") {
        const filePath = path.join(__dirname, "admin.html");
        fs.readFile(filePath, (err, data) => {
            if (err) { sendJson(res, 404, { error: "File not found" }); return; }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }

    // Serve assets
    if (method === "GET" && url.startsWith("/assets/")) {
        const filePath = path.join(__dirname, url);
        fs.readFile(filePath, (err, data) => {
            if (err) { sendJson(res, 404, { error: "File not found" }); return; }
            const ext = path.extname(filePath);
            const contentType = ext === ".css" ? "text/css" : "application/javascript";
            res.writeHead(200, { "Content-Type": contentType });
            res.end(data);
        });
        return;
    }

    // API Routes
    if (!supabase) {
        sendJson(res, 500, { error: "Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY" });
        return;
    }

    // Register start
    if (method === "POST" && url === "/api/auth/register/start") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const data = JSON.parse(body);
                const { data: existing } = await supabase.from("students").select("id").eq("email", data.email);
                if (existing && existing.length > 0) {
                    sendJson(res, 400, { error: "Email already exists" });
                    return;
                }
                const sessionId = crypto.randomUUID();
                const otp = generateOTP();
                await supabase.from("otp_sessions").insert({
                    id: sessionId,
                    purpose: "register",
                    email: data.email,
                    payload_json: JSON.stringify(data),
                    otp_code: otp,
                    expires_at: Date.now() + 5 * 60 * 1000,
                    created_at: Date.now()
                });
                sendJson(res, 200, { sessionId, otp, message: "OTP sent" });
            } catch (err) {
                sendJson(res, 500, { error: err.message });
            }
        });
        return;
    }

    // Register verify
    if (method === "POST" && url === "/api/auth/register/verify") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { sessionId, otp } = JSON.parse(body);
                const { data: session } = await supabase.from("otp_sessions").select("*").eq("id", sessionId).single();
                if (!session || session.otp_code !== otp || Date.now() > session.expires_at) {
                    sendJson(res, 400, { error: "Invalid or expired OTP" });
                    return;
                }
                const payload = JSON.parse(session.payload_json);
                const userId = crypto.randomUUID();
                await supabase.from("students").insert({
                    id: userId,
                    full_name: payload.fullName,
                    student_id: payload.studentId,
                    email: payload.email,
                    phone_number: payload.phoneNumber || "",
                    preferred_subject: payload.preferredSubject,
                    password_hash: hashPassword(payload.password),
                    created_at: new Date().toISOString(),
                    otp_verified_at: new Date().toISOString()
                });
                await supabase.from("otp_sessions").delete().eq("id", sessionId);
                sendJson(res, 200, { success: true, userId });
            } catch (err) {
                sendJson(res, 500, { error: err.message });
            }
        });
        return;
    }

    // Login start
    if (method === "POST" && url === "/api/auth/login/start") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { email, password } = JSON.parse(body);
                const { data: student } = await supabase.from("students").select("*").eq("email", email).single();
                if (!student || !verifyPassword(password, student.password_hash)) {
                    sendJson(res, 401, { error: "Invalid credentials" });
                    return;
                }
                const sessionId = crypto.randomUUID();
                const otp = generateOTP();
                await supabase.from("otp_sessions").insert({
                    id: sessionId,
                    purpose: "login",
                    email: email,
                    payload_json: JSON.stringify({ studentId: student.id }),
                    otp_code: otp,
                    expires_at: Date.now() + 5 * 60 * 1000,
                    created_at: Date.now()
                });
                sendJson(res, 200, { sessionId, otp, message: "OTP sent" });
            } catch (err) {
                sendJson(res, 500, { error: err.message });
            }
        });
        return;
    }

    // Login verify
    if (method === "POST" && url === "/api/auth/login/verify") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { sessionId, otp } = JSON.parse(body);
                const { data: session } = await supabase.from("otp_sessions").select("*").eq("id", sessionId).single();
                if (!session || session.otp_code !== otp || Date.now() > session.expires_at) {
                    sendJson(res, 400, { error: "Invalid or expired OTP" });
                    return;
                }
                const payload = JSON.parse(session.payload_json);
                const { data: student } = await supabase.from("students").select("*").eq("id", payload.studentId).single();
                await supabase.from("otp_sessions").delete().eq("id", sessionId);
                sendJson(res, 200, {
                    success: true,
                    user: {
                        id: student.id,
                        fullName: student.full_name,
                        email: student.email,
                        studentId: student.student_id
                    }
                });
            } catch (err) {
                sendJson(res, 500, { error: err.message });
            }
        });
        return;
    }

    // Exam submit
    if (method === "POST" && url === "/api/exams/submit") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const data = JSON.parse(body);
                await supabase.from("exam_attempts").insert({
                    id: crypto.randomUUID(),
                    student_id: data.studentId,
                    subject_id: data.subjectId,
                    answered_questions: data.answeredQuestions,
                    correct_answers: data.correctAnswers,
                    total_questions: data.totalQuestions,
                    percentage: data.percentage,
                    grade: data.grade,
                    time_taken_seconds: data.timeTakenSeconds,
                    auto_submitted: data.autoSubmitted ? 1 : 0,
                    completed_at: new Date().toISOString()
                });
                sendJson(res, 200, { success: true });
            } catch (err) {
                sendJson(res, 500, { error: err.message });
            }
        });
        return;
    }

    // Admin login
    if (method === "POST" && url === "/api/admin/login") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            const { email, password } = JSON.parse(body);
            if (email === "admin@practice.local" && password === "Admin123!") {
                sendJson(res, 200, { success: true, token: "admin-token" });
            } else {
                sendJson(res, 401, { error: "Invalid admin credentials" });
            }
        });
        return;
    }

    // 404
    sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
