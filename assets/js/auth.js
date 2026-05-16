const STORAGE_KEYS = {
    currentUser: "oes_current_user",
    activeExam: "oes_active_exam",
    adminSession: "oes_admin_session",
    lastExamResult: "oes_last_exam_result"
};

const SESSION_KEYS = {
    pendingRegisterOtp: "oes_pending_register_otp",
    pendingLoginOtp: "oes_pending_login_otp"
};

const API_BASE = window.location.protocol === "file:" ? "http://localhost:3000" : "";

async function apiRequest(path, options = {}) {
    let response;

    try {
        response = await fetch(`${API_BASE}${path}`, {
            method: options.method || "GET",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
    } catch (error) {
        throw new Error("Cannot connect to the app server. Start the project server and open http://localhost:3000.");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Request failed.");
    }

    return data;
}

async function adminApiRequest(path, options = {}) {
    const session = getAdminSession();
    if (!session?.token) {
        throw new Error("Admin session not found.");
    }

    return apiRequest(path, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${session.token}`
        }
    });
}

function getCurrentUser() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.currentUser);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error("Failed to read current user:", error);
        return null;
    }
}

function setCurrentUser(user) {
    localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
}

function getAdminSession() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.adminSession);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error("Failed to read admin session:", error);
        return null;
    }
}

function setAdminSession(session) {
    localStorage.setItem(STORAGE_KEYS.adminSession, JSON.stringify(session));
}

function logoutUser() {
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    localStorage.removeItem(STORAGE_KEYS.activeExam);
    sessionStorage.removeItem(SESSION_KEYS.pendingRegisterOtp);
    sessionStorage.removeItem(SESSION_KEYS.pendingLoginOtp);
    window.location.href = "login.html";
}

async function logoutAdmin() {
    const session = getAdminSession();
    localStorage.removeItem(STORAGE_KEYS.adminSession);
    if (session?.token) {
        try {
            await apiRequest("/api/admin/logout", {
                method: "POST",
                headers: { Authorization: `Bearer ${session.token}` }
            });
        } catch (error) {
            console.error("Admin logout request failed:", error);
        }
    }
    window.location.href = "admin.html";
}

function getActiveExam() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.activeExam);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error("Failed to read active exam:", error);
        return null;
    }
}

function setActiveExam(exam) {
    localStorage.setItem(STORAGE_KEYS.activeExam, JSON.stringify(exam));
}

function clearActiveExam() {
    localStorage.removeItem(STORAGE_KEYS.activeExam);
}

function setPendingOtp(key, value) {
    sessionStorage.setItem(key, JSON.stringify(value));
}

function getPendingOtp(key) {
    try {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error("Failed to read pending OTP:", error);
        return null;
    }
}

function clearPendingOtp(key) {
    sessionStorage.removeItem(key);
}

function requireAuth(redirect = "login.html") {
    if (!getCurrentUser()) {
        window.location.href = redirect;
        return false;
    }
    return true;
}

function redirectIfAuthenticated(target = "dashboard.html") {
    if (getCurrentUser()) {
        window.location.href = target;
        return true;
    }
    return false;
}

function isEmailValid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    const checks = [
        password.length >= 8,
        /[A-Z]/.test(password),
        /[a-z]/.test(password),
        /\d/.test(password)
    ];

    return {
        valid: checks.every(Boolean),
        message: checks.every(Boolean)
            ? ""
            : "Use at least 8 characters with upper case, lower case and a number."
    };
}

async function startRegisterOtp(payload) {
    return apiRequest("/api/auth/register/start", {
        method: "POST",
        body: payload
    });
}

async function verifyRegisterOtp(sessionId, otp) {
    return apiRequest("/api/auth/register/verify", {
        method: "POST",
        body: { sessionId, otp }
    });
}

async function startLoginOtp(payload) {
    return apiRequest("/api/auth/login/start", {
        method: "POST",
        body: payload
    });
}

async function verifyLoginOtp(sessionId, otp) {
    return apiRequest("/api/auth/login/verify", {
        method: "POST",
        body: { sessionId, otp }
    });
}

async function fetchStudentAttempts(studentId) {
    return apiRequest(`/api/students/${encodeURIComponent(studentId)}/attempts`);
}

async function submitExamAttempt(payload) {
    return apiRequest("/api/exams/submit", {
        method: "POST",
        body: payload
    });
}

async function adminLogin(payload) {
    return apiRequest("/api/admin/login", {
        method: "POST",
        body: payload
    });
}

async function fetchAdminSummary() {
    return adminApiRequest("/api/admin/summary");
}

async function fetchAdminStudents() {
    return adminApiRequest("/api/admin/students");
}

async function fetchAdminAttempts() {
    return adminApiRequest("/api/admin/attempts");
}

async function sendResultEmail(resultData) {
    return apiRequest("/api/results/send-email", {
        method: "POST",
        body: resultData
    });
}
