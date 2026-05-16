const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PORT = 3000;

// Helper functions
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(":");
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    return derived === hash;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create server
const server = http.createServer(async (req, res) => {
    const url = req.url;
    
    // Serve HTML files
    if (url === "/" || url === "/login.html") {
        fs.readFile(path.join(__dirname, "login.html"), (err, data) => {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }
    
    if (url === "/register.html") {
        fs.readFile(path.join(__dirname, "register.html"), (err, data) => {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }
    
    if (url === "/dashboard.html") {
        fs.readFile(path.join(__dirname, "dashboard.html"), (err, data) => {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }
    
    if (url === "/exam.html") {
        fs.readFile(path.join(__dirname, "exam.html"), (err, data) => {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }
    
    if (url === "/results.html") {
        fs.readFile(path.join(__dirname, "results.html"), (err, data) => {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }
    
    if (url === "/profile.html") {
        fs.readFile(path.join(__dirname, "profile.html"), (err, data) => {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }
    
    if (url === "/leaderboard.html") {
        fs.readFile(path.join(__dirname, "leaderboard.html"), (err, data) => {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }
    
    if (url === "/admin.html") {
        fs.readFile(path.join(__dirname, "admin.html"), (err, data) => {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data);
        });
        return;
    }
    
    // Serve assets (CSS, JS)
    if (url.startsWith("/assets/")) {
        const filePath = path.join(__dirname, url);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end();
                return;
            }
            const ext = path.extname(filePath);
            const contentType = {
                ".css": "text/css",
                ".js": "application/javascript"
            }[ext] || "text/plain";
            res.writeHead(200, { "Content-Type": contentType });
            res.end(data);
        });
        return;
    }
    
    // API: Register start
    if (url === "/api/auth/register/start" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            const data = JSON.parse(body);
            const existing = await supabase.from("students").select("id").eq("email", data.email);
            if (existing.data.length > 0) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Email already exists" }));
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
                expires_at: Date.now() + 5 * 60 * 1000
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ sessionId, otp }));
        });
        return;
    }
    
    // API: Register verify
    if (url === "/api/auth/register/verify" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            const { sessionId, otp } = JSON.parse(body);
            const session = await supabase.from("otp_sessions").select("*").eq("id", sessionId).single();
            if (!session.data || session.data.otp_code !== otp || Date.now() > session.data.expires_at) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid OTP" }));
                return;
            }
            const payload = JSON.parse(session.data.payload_json);
            const userId = crypto.randomUUID();
            await supabase.from("students").insert({
                id: userId,
                full_name: payload.fullName,
                student_id: payload.studentId,
                email: payload.email,
                phone_number: payload.phoneNumber,
                preferred_subject: payload.preferredSubject,
                password_hash: hashPassword(payload.password),
                created_at: new Date().toISOString()
            });
            await supabase.from("otp_sessions").delete().eq("id", sessionId);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, userId }));
        });
        return;
    }
    
    // API: Login start
    if (url === "/api/auth/login/start" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            const { email, password } = JSON.parse(body);
            const student = await supabase.from("students").select("*").eq("email", email).single();
            if (!student.data || !verifyPassword(password, student.data.password_hash)) {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid credentials" }));
                return;
            }
            const sessionId = crypto.randomUUID();
            const otp = generateOTP();
            await supabase.from("otp_sessions").insert({
                id: sessionId,
                purpose: "login",
                email: email,
                payload_json: JSON.stringify({ studentId: student.data.id }),
                otp_code: otp,
                expires_at: Date.now() + 5 * 60 * 1000
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ sessionId, otp }));
        });
        return;
    }
    
    // API: Login verify
    if (url === "/api/auth/login/verify" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            const { sessionId, otp } = JSON.parse(body);
            const session = await supabase.from("otp_sessions").select("*").eq("id", sessionId).single();
            if (!session.data || session.data.otp_code !== otp || Date.now() > session.data.expires_at) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid OTP" }));
                return;
            }
            const payload = JSON.parse(session.data.payload_json);
            const student = await supabase.from("students").select("*").eq("id", payload.studentId).single();
            await supabase.from("otp_sessions").delete().eq("id", sessionId);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ 
                success: true, 
                user: {
                    id: student.data.id,
                    fullName: student.data.full_name,
                    email: student.data.email,
                    studentId: student.data.student_id
                }
            }));
        });
        return;
    }
    
    // API: Exam submit
    if (url === "/api/exams/submit" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
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
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
        });
        return;
    }
    
    // API: Send email
    if (url === "/api/results/send-email" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            const data = JSON.parse(body);
            const student = await supabase.from("students").select("*").eq("id", data.studentId).single();
            const emailData = {
                to: student.data.email,
                from: "noreply@exam.com",
                subject: `Exam Results: ${data.subjectName}`,
                text: `Your score: ${data.correctAnswers}/${data.totalQuestions} (${data.percentage}%) - Grade: ${data.grade}`
            };
            const emailId = crypto.randomUUID();
            fs.writeFileSync(path.join(__dirname, "data", "emails", `${emailId}.json`), JSON.stringify(emailData));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
        });
        return;
    }
    
    // 404
    res.writeHead(404);
    res.end();
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
