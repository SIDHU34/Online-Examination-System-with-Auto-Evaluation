const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "practice-exam.db");
const EMAILS_DIR = path.join(DATA_DIR, "emails");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@practice.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const SMTP_SERVICE = process.env.SMTP_SERVICE || "local"; // "local", "sendgrid", "mailgun", or custom
const SMTP_API_KEY = process.env.SMTP_API_KEY || "";
const adminSessions = new Map();

fs.mkdirSync(EMAILS_DIR, { recursive: true });

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
    CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        student_id TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        phone_number TEXT,
        preferred_subject TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        otp_verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS otp_sessions (
        id TEXT PRIMARY KEY,
        purpose TEXT NOT NULL,
        email TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        otp_code TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        answered_questions INTEGER NOT NULL,
        correct_answers INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        percentage INTEGER NOT NULL,
        grade TEXT NOT NULL,
        time_taken_seconds INTEGER NOT NULL,
        auto_submitted INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT NOT NULL,
        FOREIGN KEY (student_id) REFERENCES students(id)
    );
`);

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const digest = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
    const [salt, digest] = String(storedHash || "").split(":");
    if (!salt || !digest) return false;
    const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(digest, "hex"));
}

function generateOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

function maskEmail(email) {
    const [name, domain] = String(email).split("@");
    if (!name || !domain) return email;
    if (name.length <= 2) return `${name[0] || ""}*@${domain}`;
    return `${name.slice(0, 2)}${"*".repeat(Math.max(name.length - 2, 1))}@${domain}`;
}

function sanitizeUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        fullName: row.full_name,
        studentId: row.student_id,
        email: row.email,
        phoneNumber: row.phone_number,
        preferredSubject: row.preferred_subject,
        createdAt: row.created_at,
        otpVerifiedAt: row.otp_verified_at
    };
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > 1_000_000) {
                reject(new Error("Request too large."));
            }
        });
        req.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (error) {
                reject(new Error("Invalid JSON body."));
            }
        });
        req.on("error", reject);
    });
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    res.end(JSON.stringify(payload));
}

function generateEmailTemplate(studentName, studentEmail, examResult, subjectMeta) {
    return {
        to: studentEmail,
        from: "noreply@practice-exam.local",
        subject: `Exam Results: ${subjectMeta.name} - ${examResult.grade}`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0b6e4f, #064e3b); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
        .result-box { background: white; padding: 15px; border-left: 4px solid #0b6e4f; margin: 15px 0; }
        .score-display { font-size: 32px; font-weight: bold; color: #0b6e4f; }
        .grade-badge { display: inline-block; background: #0b6e4f; color: white; padding: 8px 15px; border-radius: 20px; font-weight: bold; }
        .stats-row { display: flex; justify-content: space-between; margin: 10px 0; }
        .stats-item { flex: 1; }
        .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        .btn { display: inline-block; background: #0b6e4f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Your Exam Results</h1>
            <p>Practice Exam App - ${new Date().toLocaleDateString()}</p>
        </div>
        
        <div class="content">
            <p>Dear <strong>${studentName}</strong>,</p>
            
            <p>Your exam has been evaluated. Here are your results:</p>
            
            <div class="result-box">
                <h2>${subjectMeta.name}</h2>
                <div class="stats-row">
                    <div class="stats-item">
                        <p style="margin: 5px 0; font-size: 12px; color: #666;">SCORE</p>
                        <p class="score-display">${examResult.correctAnswers}/${examResult.totalQuestions}</p>
                    </div>
                    <div class="stats-item">
                        <p style="margin: 5px 0; font-size: 12px; color: #666;">PERCENTAGE</p>
                        <p class="score-display">${examResult.percentage}%</p>
                    </div>
                    <div class="stats-item">
                        <p style="margin: 5px 0; font-size: 12px; color: #666;">GRADE</p>
                        <p><span class="grade-badge">${examResult.grade}</span></p>
                    </div>
                </div>
            </div>
            
            <div class="result-box">
                <h3>Performance Details</h3>
                <div class="stats-row">
                    <div>✅ Correct Answers: <strong>${examResult.correctAnswers}</strong></div>
                </div>
                <div class="stats-row">
                    <div>❌ Incorrect Answers: <strong>${examResult.answeredQuestions - examResult.correctAnswers}</strong></div>
                </div>
                <div class="stats-row">
                    <div>⏭️ Unanswered: <strong>${examResult.totalQuestions - examResult.answeredQuestions}</strong></div>
                </div>
                <div class="stats-row">
                    <div>⏱️ Time Taken: <strong>${Math.floor(examResult.timeTakenSeconds / 60)} minutes ${examResult.timeTakenSeconds % 60} seconds</strong></div>
                </div>
            </div>
            
            <p style="background: #f0f8ff; padding: 12px; border-radius: 5px; border-left: 4px solid #0b6e4f;">
                <strong>Recommendation:</strong> ${getEmailRecommendation(examResult.percentage)}
            </p>
            
            <center>
                <a href="http://localhost:3000/dashboard.html" class="btn">View Full Results</a>
            </center>
            
            <p style="margin-top: 30px; text-align: center; font-size: 12px; color: #999;">
                This is an automated exam results notification. Please do not reply to this email.
            </p>
        </div>
        
        <div class="footer">
            <p>© 2024 Practice Exam App. All rights reserved.</p>
            <p>Questions? Contact admin@practice.local</p>
        </div>
    </div>
</body>
</html>
        `,
        text: `
Exam Results - ${subjectMeta.name}

Dear ${studentName},

Your exam has been evaluated. Here are your results:

Subject: ${subjectMeta.name}
Score: ${examResult.correctAnswers}/${examResult.totalQuestions}
Percentage: ${examResult.percentage}%
Grade: ${examResult.grade}
Time Taken: ${Math.floor(examResult.timeTakenSeconds / 60)} minutes ${examResult.timeTakenSeconds % 60} seconds

Performance Details:
- Correct Answers: ${examResult.correctAnswers}
- Incorrect Answers: ${examResult.answeredQuestions - examResult.correctAnswers}
- Unanswered: ${examResult.totalQuestions - examResult.answeredQuestions}

Recommendation: ${getEmailRecommendation(examResult.percentage)}

View your full results: http://localhost:3000/dashboard.html

---
This is an automated exam results notification. Please do not reply to this email.
© 2024 Practice Exam App
        `
    };
}

function getEmailRecommendation(percentage) {
    if (percentage >= 80) {
        return "Excellent performance! You have a strong understanding of this subject. Keep up the great work!";
    }
    if (percentage >= 60) {
        return "Good performance! You have a solid grasp of most concepts. Review the areas where you struggled.";
    }
    if (percentage >= 40) {
        return "Fair performance. Consider reviewing the key concepts and taking additional practice tests.";
    }
    return "Keep practicing. Focus on understanding the fundamental concepts before attempting more exams.";
}

async function sendEmail(emailData) {
    return new Promise((resolve, reject) => {
        try {
            if (SMTP_SERVICE === "local") {
                // Save email locally in data/emails directory
                const emailId = crypto.randomUUID();
                const emailFile = path.join(EMAILS_DIR, `${emailId}.json`);
                const emailLog = {
                    id: emailId,
                    timestamp: new Date().toISOString(),
                    to: emailData.to,
                    from: emailData.from,
                    subject: emailData.subject,
                    status: "sent",
                    localStorageOnly: true
                };
                
                fs.writeFile(emailFile, JSON.stringify(emailLog, null, 2), (err) => {
                    if (err) {
                        console.error("Failed to save email:", err);
                        reject(new Error("Failed to send email"));
                    } else {
                        console.log(`Email saved locally: ${emailFile}`);
                        resolve({ id: emailId, status: "sent", message: "Email sent successfully" });
                    }
                });
            } else if (SMTP_SERVICE === "sendgrid") {
                // SendGrid API integration
                const postData = JSON.stringify({
                    personalizations: [{ to: [{ email: emailData.to }] }],
                    from: { email: emailData.from },
                    subject: emailData.subject,
                    content: [
                        { type: "text/html", value: emailData.html },
                        { type: "text/plain", value: emailData.text }
                    ]
                });

                const options = {
                    hostname: "api.sendgrid.com",
                    port: 443,
                    path: "/v3/mail/send",
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${SMTP_API_KEY}`,
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(postData)
                    }
                };

                const req = https.request(options, (res) => {
                    let data = "";
                    res.on("data", (chunk) => { data += chunk; });
                    res.on("end", () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ status: "sent", message: "Email sent via SendGrid" });
                        } else {
                            reject(new Error(`SendGrid error: ${res.statusCode}`));
                        }
                    });
                });

                req.on("error", reject);
                req.write(postData);
                req.end();
            } else {
                reject(new Error("Email service not configured"));
            }
        } catch (error) {
            reject(error);
        }
    });
}

function createAdminSession() {
    const token = crypto.randomUUID();
    adminSessions.set(token, { createdAt: Date.now() });
    return token;
}

function getAdminToken(req) {
    const header = req.headers.authorization || "";
    const prefix = "Bearer ";
    return header.startsWith(prefix) ? header.slice(prefix.length) : "";
}

function requireAdmin(req, res) {
    const token = getAdminToken(req);
    if (!token || !adminSessions.has(token)) {
        sendJson(res, 401, { message: "Admin authentication required." });
        return null;
    }
    return token;
}

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon"
    }[ext] || "application/octet-stream";
}

function serveStatic(reqPath, res) {
    const resolvedPath = reqPath === "/" ? "/login.html" : reqPath;
    const filePath = path.normalize(path.join(ROOT_DIR, resolvedPath));

    if (!filePath.startsWith(ROOT_DIR)) {
        sendJson(res, 403, { message: "Forbidden" });
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            sendJson(res, 404, { message: "Not found" });
            return;
        }

        res.writeHead(200, { "Content-Type": getContentType(filePath) });
        res.end(content);
    });
}

function createOtpSession(purpose, email, payload) {
    db.prepare("DELETE FROM otp_sessions WHERE email = ? AND purpose = ?").run(email, purpose);

    const id = crypto.randomUUID();
    const otp = generateOtp();
    const now = Date.now();
    const expiresAt = now + 5 * 60 * 1000;

    db.prepare(`
        INSERT INTO otp_sessions (id, purpose, email, payload_json, otp_code, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, purpose, email, JSON.stringify(payload), otp, expiresAt, now);

    return {
        sessionId: id,
        maskedEmail: maskEmail(email),
        otpPreview: otp
    };
}

function getOtpSession(sessionId, purpose) {
    return db.prepare("SELECT * FROM otp_sessions WHERE id = ? AND purpose = ?").get(sessionId, purpose);
}

function removeOtpSession(sessionId) {
    db.prepare("DELETE FROM otp_sessions WHERE id = ?").run(sessionId);
}

function validateRegistration(payload) {
    if (!payload.fullName || payload.fullName.trim().length < 3) return "Full name must be at least 3 characters.";
    if (!payload.studentId || payload.studentId.trim().length < 6) return "Student ID must be at least 6 characters.";
    if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return "Valid email is required.";
    if (!payload.preferredSubject) return "Preferred subject is required.";
    if (!payload.password || payload.password.length < 8) return "Password must be at least 8 characters.";
    return null;
}

function seedDemoStudent() {
    const existing = db.prepare("SELECT id FROM students WHERE email = ?").get("aarav@example.com");
    if (existing) return;

    db.prepare(`
        INSERT INTO students (id, full_name, student_id, email, phone_number, preferred_subject, password_hash, created_at, otp_verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        crypto.randomUUID(),
        "Aarav Sharma",
        "BCA2026001",
        "aarav@example.com",
        "9876543210",
        "data-structures",
        hashPassword("Password123"),
        new Date().toISOString(),
        new Date().toISOString()
    );
}

seedDemoStudent();

async function handleApi(req, res, url) {
    // Debug logging
    if (url.pathname.includes("/results/") || url.pathname.includes("email") || req.method === "POST") {
        console.log(`[DEBUG] Request: ${req.method} ${url.pathname}`);
    }
    
    if (req.method === "GET" && url.pathname === "/api/health") {
        sendJson(res, 200, { ok: true, database: DB_PATH });
        return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register/start") {
        const body = await readBody(req);
        const validationError = validateRegistration(body);
        if (validationError) {
            sendJson(res, 400, { message: validationError });
            return;
        }

        const emailExists = db.prepare("SELECT id FROM students WHERE email = ?").get(body.email.trim().toLowerCase());
        if (emailExists) {
            sendJson(res, 409, { message: "An account with this email already exists." });
            return;
        }

        const studentIdExists = db.prepare("SELECT id FROM students WHERE student_id = ?").get(body.studentId.trim());
        if (studentIdExists) {
            sendJson(res, 409, { message: "That student ID is already registered." });
            return;
        }

        const payload = {
            id: crypto.randomUUID(),
            fullName: body.fullName.trim(),
            studentId: body.studentId.trim(),
            email: body.email.trim().toLowerCase(),
            phoneNumber: body.phoneNumber?.trim() || "",
            preferredSubject: body.preferredSubject,
            passwordHash: hashPassword(body.password),
            createdAt: new Date().toISOString()
        };

        sendJson(res, 200, createOtpSession("register", payload.email, payload));
        return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register/verify") {
        const body = await readBody(req);
        const session = getOtpSession(body.sessionId, "register");

        if (!session) {
            sendJson(res, 404, { message: "Registration OTP session not found." });
            return;
        }

        if (Date.now() > session.expires_at) {
            removeOtpSession(session.id);
            sendJson(res, 410, { message: "OTP has expired. Please request a new code." });
            return;
        }

        if (String(body.otp).trim() !== session.otp_code) {
            sendJson(res, 400, { message: "Incorrect OTP. Please try again." });
            return;
        }

        const payload = JSON.parse(session.payload_json);
        const verifiedAt = new Date().toISOString();

        db.prepare(`
            INSERT INTO students (id, full_name, student_id, email, phone_number, preferred_subject, password_hash, created_at, otp_verified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            payload.id,
            payload.fullName,
            payload.studentId,
            payload.email,
            payload.phoneNumber,
            payload.preferredSubject,
            payload.passwordHash,
            payload.createdAt,
            verifiedAt
        );

        removeOtpSession(session.id);
        const row = db.prepare("SELECT * FROM students WHERE id = ?").get(payload.id);
        sendJson(res, 200, { user: sanitizeUser(row) });
        return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login/start") {
        const body = await readBody(req);
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        const row = db.prepare("SELECT * FROM students WHERE email = ?").get(email);
        if (!row || !verifyPassword(password, row.password_hash)) {
            sendJson(res, 401, { message: "Incorrect email or password." });
            return;
        }

        sendJson(res, 200, {
            ...createOtpSession("login", email, { studentId: row.id }),
            email,
            passwordEcho: password
        });
        return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login/verify") {
        const body = await readBody(req);
        const session = getOtpSession(body.sessionId, "login");

        if (!session) {
            sendJson(res, 404, { message: "Login OTP session not found." });
            return;
        }

        if (Date.now() > session.expires_at) {
            removeOtpSession(session.id);
            sendJson(res, 410, { message: "OTP has expired. Please login again." });
            return;
        }

        if (String(body.otp).trim() !== session.otp_code) {
            sendJson(res, 400, { message: "Incorrect OTP. Please try again." });
            return;
        }

        const payload = JSON.parse(session.payload_json);
        const row = db.prepare("SELECT * FROM students WHERE id = ?").get(payload.studentId);
        removeOtpSession(session.id);

        if (!row) {
            sendJson(res, 404, { message: "Student not found." });
            return;
        }

        sendJson(res, 200, { user: sanitizeUser(row) });
        return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/login") {
        const body = await readBody(req);
        if (body.email !== ADMIN_EMAIL || body.password !== ADMIN_PASSWORD) {
            sendJson(res, 401, { message: "Invalid admin credentials." });
            return;
        }

        sendJson(res, 200, {
            token: createAdminSession(),
            admin: { email: ADMIN_EMAIL }
        });
        return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/logout") {
        const token = getAdminToken(req);
        if (token) adminSessions.delete(token);
        sendJson(res, 200, { success: true });
        return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/summary") {
        if (!requireAdmin(req, res)) return;

        const students = db.prepare("SELECT COUNT(*) AS count FROM students").get().count;
        const attempts = db.prepare("SELECT COUNT(*) AS count FROM exam_attempts").get().count;
        const avgRow = db.prepare("SELECT COALESCE(ROUND(AVG(percentage)), 0) AS average_score FROM exam_attempts").get();
        const topSubjects = db.prepare(`
            SELECT subject_id, COUNT(*) AS attempts
            FROM exam_attempts
            GROUP BY subject_id
            ORDER BY attempts DESC
            LIMIT 5
        `).all();

        sendJson(res, 200, {
            students,
            attempts,
            averageScore: avgRow.average_score,
            topSubjects
        });
        return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/students") {
        if (!requireAdmin(req, res)) return;

        const rows = db.prepare(`
            SELECT s.id, s.full_name, s.student_id, s.email, s.phone_number, s.preferred_subject,
                   s.created_at, s.otp_verified_at,
                   COUNT(e.id) AS attempts_count,
                   COALESCE(ROUND(AVG(e.percentage)), 0) AS average_score
            FROM students s
            LEFT JOIN exam_attempts e ON e.student_id = s.id
            GROUP BY s.id
            ORDER BY datetime(s.created_at) DESC
        `).all().map((row) => ({
            id: row.id,
            fullName: row.full_name,
            studentId: row.student_id,
            email: row.email,
            phoneNumber: row.phone_number,
            preferredSubject: row.preferred_subject,
            createdAt: row.created_at,
            otpVerifiedAt: row.otp_verified_at,
            attemptsCount: row.attempts_count,
            averageScore: row.average_score
        }));

        sendJson(res, 200, { students: rows });
        return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/attempts") {
        if (!requireAdmin(req, res)) return;

        const rows = db.prepare(`
            SELECT e.*, s.full_name, s.student_id AS student_code
            FROM exam_attempts e
            JOIN students s ON s.id = e.student_id
            ORDER BY datetime(e.completed_at) DESC
        `).all().map((row) => ({
            id: row.id,
            studentId: row.student_id,
            studentName: row.full_name,
            studentCode: row.student_code,
            subjectId: row.subject_id,
            answeredQuestions: row.answered_questions,
            correctAnswers: row.correct_answers,
            totalQuestions: row.total_questions,
            percentage: row.percentage,
            grade: row.grade,
            timeTakenSeconds: row.time_taken_seconds,
            autoSubmitted: Boolean(row.auto_submitted),
            completedAt: row.completed_at
        }));

        sendJson(res, 200, { attempts: rows });
        return;
    }

    const attemptsMatch = req.method === "GET" && url.pathname.match(/^\/api\/students\/([^/]+)\/attempts$/);
    if (attemptsMatch) {
        const studentId = decodeURIComponent(attemptsMatch[1]);
        const attempts = db.prepare(`
            SELECT * FROM exam_attempts
            WHERE student_id = ?
            ORDER BY datetime(completed_at) DESC
        `).all(studentId).map((row) => ({
            id: row.id,
            subjectId: row.subject_id,
            answeredQuestions: row.answered_questions,
            correctAnswers: row.correct_answers,
            totalQuestions: row.total_questions,
            percentage: row.percentage,
            grade: row.grade,
            timeTakenSeconds: row.time_taken_seconds,
            autoSubmitted: Boolean(row.auto_submitted),
            completedAt: row.completed_at
        }));

        sendJson(res, 200, { attempts });
        return;
    }

    if (req.method === "POST" && url.pathname === "/api/exams/submit") {
        const body = await readBody(req);
        const student = db.prepare("SELECT id FROM students WHERE id = ?").get(body.studentId);

        if (!student) {
            sendJson(res, 404, { message: "Student not found for exam submission." });
            return;
        }

        db.prepare(`
            INSERT INTO exam_attempts (
                id, student_id, subject_id, answered_questions, correct_answers, total_questions,
                percentage, grade, time_taken_seconds, auto_submitted, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            crypto.randomUUID(),
            body.studentId,
            body.subjectId,
            Number(body.answeredQuestions || 0),
            Number(body.correctAnswers || 0),
            Number(body.totalQuestions || 0),
            Number(body.percentage || 0),
            String(body.grade || "F"),
            Number(body.timeTakenSeconds || 0),
            body.autoSubmitted ? 1 : 0,
            new Date().toISOString()
        );

        sendJson(res, 200, { success: true });
        return;
    }

    if (req.method === "POST" && url.pathname === "/api/results/send-email") {
        console.log("[DEBUG] Email endpoint - Reading body...");
        const body = await readBody(req);
        console.log("[DEBUG] Email endpoint - Body received:", JSON.stringify(body));
        
        // Get student details
        const student = db.prepare("SELECT * FROM students WHERE id = ?").get(body.studentId);
        console.log("[DEBUG] Email endpoint - Student found:", !!student);
        if (!student) {
            sendJson(res, 404, { message: "Student not found." });
            return;
        }

        // Validate required fields
        if (!body.subjectId || !body.percentage || !body.grade) {
            console.log("[DEBUG] Email endpoint - Missing fields");
            sendJson(res, 400, { message: "Missing required fields: subjectId, percentage, grade." });
            return;
        }

        try {
            console.log("[DEBUG] Email endpoint - Generating template...");
            // Generate email template
            const subjectMeta = {
                name: body.subjectName || body.subjectId,
                id: body.subjectId
            };

            const examResult = {
                correctAnswers: Number(body.correctAnswers || 0),
                totalQuestions: Number(body.totalQuestions || 0),
                answeredQuestions: Number(body.answeredQuestions || 0),
                percentage: Number(body.percentage || 0),
                grade: String(body.grade || "F"),
                timeTakenSeconds: Number(body.timeTakenSeconds || 0)
            };

            const emailData = generateEmailTemplate(student.full_name, student.email, examResult, subjectMeta);
            console.log("[DEBUG] Email endpoint - Template generated, sending email...");
            
            // Send email
            const result = await sendEmail(emailData);
            console.log("[DEBUG] Email endpoint - Email sent, result:", result);
            
            sendJson(res, 200, {
                success: true,
                message: "Exam results email sent successfully",
                emailSent: true,
                recipient: student.email,
                result
            });
        } catch (error) {
            console.error("Email sending error:", error);
            sendJson(res, 500, {
                success: false,
                message: "Failed to send email: " + error.message,
                emailSent: false
            });
        }
        return;
    }

    sendJson(res, 404, { message: "API endpoint not found." });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
        if (req.method === "OPTIONS") {
            res.writeHead(204, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
            });
            res.end();
            return;
        }

        if (url.pathname.startsWith("/api/")) {
            await handleApi(req, res, url);
            return;
        }

        serveStatic(url.pathname, res);
    } catch (error) {
        console.error(error);
        sendJson(res, 500, { message: "Internal server error." });
    }
});

server.listen(PORT, () => {
    console.log(`Practice exam app running on http://localhost:${PORT}`);
    console.log(`SQLite database: ${DB_PATH}`);
});
