function byId(id) {
    return document.getElementById(id);
}

function showFatalError(message) {
    document.body.innerHTML = `
        <main class="page-shell">
            <section class="dashboard-panel">
                <span class="eyebrow">Application Status</span>
                <h1>Practice Exam App</h1>
                <p class="subtle">${message}</p>
                <div class="btn-row">
                    <a class="btn btn-primary" href="login.html">Go to Login</a>
                    <a class="btn btn-secondary" href="admin.html">Go to Admin</a>
                </div>
            </section>
        </main>
    `;
}

function formatDateTime(value) {
    return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(value));
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function gradeFromScore(percentage) {
    if (percentage >= 90) return "A+";
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B";
    if (percentage >= 60) return "C";
    if (percentage >= 50) return "D";
    return "F";
}

function showAlerts(container, alerts) {
    if (!container) return;
    container.innerHTML = alerts.length
        ? alerts.map(({ type, message }) => `<div class="alert alert-${type}">${message}</div>`).join("")
        : "";
}

function getSubjectMeta(subjectId) {
    return SUBJECTS.find((subject) => subject.id === subjectId) || null;
}

function renderSubjectOptions(selectedId = "") {
    return SUBJECTS.map((subject) => {
        const selected = subject.id === selectedId ? "selected" : "";
        return `<option value="${subject.id}" ${selected}>${subject.name} - ${subject.category}</option>`;
    }).join("");
}

function shuffleArray(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
}

function buildExamQuestions(subjectId, count) {
    const bank = QUESTION_BANK[subjectId] || [];
    const grouped = new Map();

    bank.forEach((question) => {
        const key = question.conceptKey || question.variantKey || question.question;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(question);
    });

    return shuffleArray(
        Array.from(grouped.values()).map((variants) => variants[Math.floor(Math.random() * variants.length)])
    ).slice(0, count);
}

function setOtpPreview(session) {
    const container = byId("otpPreview");
    const code = byId("otpPreviewCode");
    const target = byId("otpPreviewTarget");
    const timer = byId("otpPreviewTimer");

    if (!container || !code || !target || !timer) return;

    if (!session) {
        container.hidden = true;
        return;
    }

    container.hidden = false;
    code.textContent = session.otpPreview;
    target.textContent = session.maskedEmail;
    timer.textContent = "Valid for 5 minutes";
}

function startExamSession(subjectId) {
    const currentUser = getCurrentUser();
    const subject = getSubjectMeta(subjectId);
    const questions = buildExamQuestions(subjectId, subject?.questionCount || 10);

    if (!currentUser || !subject || !questions.length) return false;

    setActiveExam({
        sessionId: crypto.randomUUID(),
        userId: currentUser.id,
        subjectId,
        questions,
        answers: new Array(questions.length).fill(null),
        currentIndex: 0,
        startedAt: Date.now(),
        durationSeconds: subject.duration * 60
    });

    window.location.href = `exam.html?subject=${encodeURIComponent(subjectId)}`;
    return true;
}

function attachLogout() {
    const button = byId("logoutBtn");
    if (button) button.addEventListener("click", logoutUser);
}

function restoreRegisterVerificationView() {
    const pending = getPendingOtp(SESSION_KEYS.pendingRegisterOtp);
    if (!pending) return;

    byId("registerSetupPanel").hidden = true;
    byId("registerVerifyPanel").hidden = false;
    byId("registerOtpStatus").textContent = `Verification code sent to ${pending.maskedEmail}.`;
    setOtpPreview(pending);
}

function restoreLoginVerificationView() {
    const pending = getPendingOtp(SESSION_KEYS.pendingLoginOtp);
    if (!pending) return;

    byId("loginCredentialsPanel").hidden = true;
    byId("loginVerifyPanel").hidden = false;
    byId("loginOtpStatus").textContent = `Verification code sent to ${pending.maskedEmail}.`;
    setOtpPreview(pending);
}

function initRegisterPage() {
    if (redirectIfAuthenticated()) return;

    const form = byId("registerForm");
    const otpForm = byId("registerOtpForm");
    const subjectSelect = byId("preferredSubject");
    const alertBox = byId("registerAlerts");

    subjectSelect.innerHTML = `<option value="">Select a preferred subject</option>${renderSubjectOptions()}`;
    restoreRegisterVerificationView();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const payload = {
            fullName: byId("fullName").value.trim(),
            studentId: byId("studentId").value.trim(),
            email: byId("email").value.trim(),
            phoneNumber: byId("phoneNumber").value.trim(),
            preferredSubject: byId("preferredSubject").value,
            password: byId("password").value,
            confirmPassword: byId("confirmPassword").value
        };

        const alerts = [];
        if (payload.fullName.length < 3) alerts.push({ type: "error", message: "Full name must be at least 3 characters." });
        if (payload.studentId.length < 6) alerts.push({ type: "error", message: "Student ID must be at least 6 characters." });
        if (!isEmailValid(payload.email)) alerts.push({ type: "error", message: "Please enter a valid email address." });
        if (!payload.preferredSubject) alerts.push({ type: "error", message: "Please choose a preferred subject." });

        const passwordCheck = validatePassword(payload.password);
        if (!passwordCheck.valid) alerts.push({ type: "error", message: passwordCheck.message });
        if (payload.password !== payload.confirmPassword) alerts.push({ type: "error", message: "Password confirmation does not match." });

        showAlerts(alertBox, alerts);
        if (alerts.length) return;

        try {
            const response = await startRegisterOtp(payload);
            setPendingOtp(SESSION_KEYS.pendingRegisterOtp, {
                ...response,
                payload
            });

            byId("registerSetupPanel").hidden = true;
            byId("registerVerifyPanel").hidden = false;
            byId("registerOtpStatus").textContent = `Verification code sent to ${response.maskedEmail}.`;
            setOtpPreview(response);
            showAlerts(alertBox, [
                { type: "success", message: "Student details saved for verification. Enter the OTP to complete registration." }
            ]);
        } catch (error) {
            showAlerts(alertBox, [{ type: "error", message: error.message }]);
        }
    });

    otpForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const pending = getPendingOtp(SESSION_KEYS.pendingRegisterOtp);
        if (!pending) {
            showAlerts(alertBox, [{ type: "error", message: "OTP session not found. Please start registration again." }]);
            return;
        }

        try {
            const response = await verifyRegisterOtp(pending.sessionId, byId("registerOtp").value.trim());
            clearPendingOtp(SESSION_KEYS.pendingRegisterOtp);
            setCurrentUser(response.user);
            clearActiveExam();
            window.location.href = "dashboard.html";
        } catch (error) {
            showAlerts(alertBox, [{ type: "error", message: error.message }]);
        }
    });

    byId("registerResendOtp").addEventListener("click", async () => {
        const pending = getPendingOtp(SESSION_KEYS.pendingRegisterOtp);
        if (!pending) return;

        try {
            const response = await startRegisterOtp(pending.payload);
            setPendingOtp(SESSION_KEYS.pendingRegisterOtp, {
                ...response,
                payload: pending.payload
            });
            byId("registerOtpStatus").textContent = `New verification code sent to ${response.maskedEmail}.`;
            setOtpPreview(response);
            showAlerts(alertBox, [{ type: "success", message: "A new OTP has been generated." }]);
        } catch (error) {
            showAlerts(alertBox, [{ type: "error", message: error.message }]);
        }
    });
}

function initLoginPage() {
    if (redirectIfAuthenticated()) return;

    const form = byId("loginForm");
    const otpForm = byId("loginOtpForm");
    const alertBox = byId("loginAlerts");

    restoreLoginVerificationView();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        try {
            const response = await startLoginOtp({
                email: byId("loginEmail").value.trim(),
                password: byId("loginPassword").value
            });

            setPendingOtp(SESSION_KEYS.pendingLoginOtp, response);
            byId("loginCredentialsPanel").hidden = true;
            byId("loginVerifyPanel").hidden = false;
            byId("loginOtpStatus").textContent = `Verification code sent to ${response.maskedEmail}.`;
            setOtpPreview(response);
            showAlerts(alertBox, [{ type: "success", message: "Password accepted. Enter the OTP to continue." }]);
        } catch (error) {
            showAlerts(alertBox, [{ type: "error", message: error.message }]);
        }
    });

    otpForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const pending = getPendingOtp(SESSION_KEYS.pendingLoginOtp);

        if (!pending) {
            showAlerts(alertBox, [{ type: "error", message: "OTP session not found. Please log in again." }]);
            return;
        }

        try {
            const response = await verifyLoginOtp(pending.sessionId, byId("loginOtp").value.trim());
            clearPendingOtp(SESSION_KEYS.pendingLoginOtp);
            setCurrentUser(response.user);
            window.location.href = "dashboard.html";
        } catch (error) {
            showAlerts(alertBox, [{ type: "error", message: error.message }]);
        }
    });

    byId("loginResendOtp").addEventListener("click", async () => {
        const pending = getPendingOtp(SESSION_KEYS.pendingLoginOtp);
        if (!pending) return;

        try {
            const response = await startLoginOtp({
                email: pending.email,
                password: pending.passwordEcho
            });
            setPendingOtp(SESSION_KEYS.pendingLoginOtp, response);
            byId("loginOtpStatus").textContent = `New verification code sent to ${response.maskedEmail}.`;
            setOtpPreview(response);
            showAlerts(alertBox, [{ type: "success", message: "A new OTP has been generated." }]);
        } catch (error) {
            showAlerts(alertBox, [{ type: "error", message: error.message }]);
        }
    });
}

async function renderDashboard() {
    if (!requireAuth()) return;
    attachLogout();

    const user = getCurrentUser();
    const response = await fetchStudentAttempts(user.id).catch((error) => ({ attempts: [], error: error.message }));
    const history = response.attempts || [];
    const completed = history.length;
    const averageScore = completed ? Math.round(history.reduce((sum, entry) => sum + entry.percentage, 0) / completed) : 0;
    const bestScore = completed ? Math.max(...history.map((entry) => entry.percentage)) : 0;
    const preferred = getSubjectMeta(user.preferredSubject);
    const competitiveSubjects = SUBJECTS.filter((subject) => subject.category === "Competitive Exam").length;

    byId("welcomeName").textContent = user.fullName.split(" ")[0];
    byId("profileName").textContent = user.fullName;
    byId("profileEmail").textContent = user.email;
    byId("profileStudentId").textContent = user.studentId;
    byId("profileSubject").textContent = preferred ? preferred.name : "Not set";
    byId("profileVerified").textContent = user.otpVerifiedAt ? `Verified on ${formatDateTime(user.otpVerifiedAt)}` : "Pending verification";
    byId("statAttempts").textContent = completed;
    byId("statAverage").textContent = `${averageScore}%`;
    byId("statBest").textContent = `${bestScore}%`;
    byId("statSubjects").textContent = competitiveSubjects;

    byId("subjectGrid").innerHTML = SUBJECTS.map((subject) => `
        <article class="subject-card">
            <div class="pill">${subject.category}</div>
            <h3>${subject.name}</h3>
            <p>${QUESTION_BANK[subject.id].length} question bank - ${subject.questionCount} per exam - ${subject.duration} minutes</p>
            <div class="btn-row">
                <button class="btn btn-primary" data-subject-start="${subject.id}">Start Exam</button>
            </div>
        </article>
    `).join("");

    document.querySelectorAll("[data-subject-start]").forEach((button) => {
        button.addEventListener("click", () => startExamSession(button.dataset.subjectStart));
    });

    if (preferred) {
        byId("quickStartBtn").addEventListener("click", () => startExamSession(preferred.id));
    }

    const historyContainer = byId("historyList");
    if (!completed) {
        historyContainer.innerHTML = `<div class="center-empty">No completed exams in the database yet. Start your first assessment to build your record.</div>`;
        return;
    }

    historyContainer.innerHTML = history.map((entry) => `
        <article class="history-card">
            <h3>${getSubjectMeta(entry.subjectId)?.name || entry.subjectId}</h3>
            <div class="history-list">
                <div class="history-item"><span>Score</span><strong>${entry.correctAnswers}/${entry.totalQuestions} (${entry.percentage}%)</strong></div>
                <div class="history-item"><span>Grade</span><strong>${entry.grade}</strong></div>
                <div class="history-item"><span>Completed</span><strong>${formatDateTime(entry.completedAt)}</strong></div>
            </div>
        </article>
        `).join("");
}

async function initAdminPage() {
    const loginPanel = byId("adminLoginPanel");
    const dashboard = byId("adminDashboard");
    const alertBox = byId("adminAlerts");
    const initialSession = getAdminSession();

    async function renderAdminData() {
        const currentSession = getAdminSession();
        const [summary, studentsData, attemptsData] = await Promise.all([
            fetchAdminSummary(),
            fetchAdminStudents(),
            fetchAdminAttempts()
        ]);

        byId("adminIdentity").textContent = currentSession?.admin?.email || "admin";
        byId("adminStatStudents").textContent = summary.students;
        byId("adminStatAttempts").textContent = summary.attempts;
        byId("adminStatAverage").textContent = `${summary.averageScore}%`;
        byId("adminStatTop").textContent = summary.topSubjects.length
            ? (getSubjectMeta(summary.topSubjects[0].subject_id)?.name || summary.topSubjects[0].subject_id)
            : "-";

        byId("adminStudentsTable").innerHTML = studentsData.students.map((student) => `
            <tr>
                <td>${student.fullName}</td>
                <td>${student.studentId}</td>
                <td>${student.email}</td>
                <td>${getSubjectMeta(student.preferredSubject)?.name || student.preferredSubject}</td>
                <td>${student.attemptsCount}</td>
                <td>${student.averageScore}%</td>
            </tr>
        `).join("") || `<tr><td colspan="6">No students found.</td></tr>`;

        byId("adminAttemptsTable").innerHTML = attemptsData.attempts.map((attempt) => `
            <tr>
                <td>${attempt.studentName}<br><span class="subtle">${attempt.studentCode}</span></td>
                <td>${getSubjectMeta(attempt.subjectId)?.name || attempt.subjectId}</td>
                <td>${attempt.correctAnswers}/${attempt.totalQuestions} (${attempt.percentage}%)</td>
                <td>${attempt.grade}</td>
                <td>${formatDuration(attempt.timeTakenSeconds)}</td>
                <td>${formatDateTime(attempt.completedAt)}</td>
            </tr>
        `).join("") || `<tr><td colspan="6">No attempts found.</td></tr>`;
    }

    if (initialSession?.token) {
        loginPanel.hidden = true;
        dashboard.hidden = false;
        try {
            await renderAdminData();
        } catch (error) {
            localStorage.removeItem(STORAGE_KEYS.adminSession);
            loginPanel.hidden = false;
            dashboard.hidden = true;
            showAlerts(alertBox, [{ type: "error", message: error.message }]);
        }
    }

    byId("adminLoginForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            const response = await adminLogin({
                email: byId("adminEmail").value.trim(),
                password: byId("adminPassword").value
            });
            setAdminSession(response);
            loginPanel.hidden = true;
            dashboard.hidden = false;
            showAlerts(alertBox, []);
            await renderAdminData();
        } catch (error) {
            showAlerts(alertBox, [{ type: "error", message: error.message }]);
        }
    });

    const logoutBtn = byId("adminLogoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logoutAdmin);
    }
}

function initExamPage() {
    if (!requireAuth()) return;
    attachLogout();

    const user = getCurrentUser();
    const urlSubject = new URLSearchParams(window.location.search).get("subject");
    let session = getActiveExam();

    if (!session || session.userId !== user.id || (urlSubject && session.subjectId !== urlSubject)) {
        if (urlSubject && QUESTION_BANK[urlSubject]) {
            startExamSession(urlSubject);
            return;
        }
        window.location.href = "dashboard.html";
        return;
    }

    const subject = getSubjectMeta(session.subjectId);
    const questions = session.questions || buildExamQuestions(session.subjectId, subject.questionCount);
    let submitted = false;
    let timerId = null;

    byId("examSubjectName").textContent = subject.name;
    byId("examSubjectMeta").textContent = `${subject.category} - ${questions.length} selected from ${QUESTION_BANK[session.subjectId].length} questions - ${subject.level}`;
    byId("examCandidateName").textContent = user.fullName;
    byId("examCandidateId").textContent = user.studentId;

    function remainingSeconds() {
        const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
        return Math.max(session.durationSeconds - elapsed, 0);
    }

    function persistSession() {
        setActiveExam(session);
    }

    function renderPalette() {
        byId("paletteGrid").innerHTML = questions.map((_, index) => {
            const classes = ["palette-btn"];
            if (session.currentIndex === index) classes.push("current");
            if (session.answers[index] !== null) classes.push("answered");
            return `<button class="${classes.join(" ")}" type="button" data-jump="${index}">${index + 1}</button>`;
        }).join("");

        byId("paletteGrid").querySelectorAll("[data-jump]").forEach((button) => {
            button.addEventListener("click", () => {
                session.currentIndex = Number(button.dataset.jump);
                persistSession();
                renderQuestion();
            });
        });
    }

    function renderQuestion() {
        const index = session.currentIndex;
        const question = questions[index];
        const currentAnswer = session.answers[index];

        byId("progressFill").style.width = `${((index + 1) / questions.length) * 100}%`;
        byId("questionCard").innerHTML = `
            <div class="question-meta">
                <span>Question ${index + 1} of ${questions.length}</span>
                <span>${session.answers.filter((answer) => answer !== null).length} answered</span>
            </div>
            <div class="question-text">${question.question}</div>
            <div class="option-list">
                ${question.options.map((option, optionIndex) => `
                    <label class="option-item ${currentAnswer === optionIndex ? "selected" : ""}">
                        <input type="radio" name="examAnswer" value="${optionIndex}" ${currentAnswer === optionIndex ? "checked" : ""}>
                        <span>${option}</span>
                    </label>
                `).join("")}
            </div>
        `;

        byId("questionCard").querySelectorAll("input[name='examAnswer']").forEach((input) => {
            input.addEventListener("change", () => {
                session.answers[index] = Number(input.value);
                persistSession();
                renderPalette();
                renderQuestion();
            });
        });

        byId("prevBtn").disabled = index === 0;
        byId("nextBtn").disabled = index === questions.length - 1;
        renderPalette();
    }

    async function submitExam(autoSubmitted = false) {
        if (submitted) return;
        submitted = true;
        clearInterval(timerId);

        const answered = session.answers.filter((answer) => answer !== null).length;
        const correctAnswers = questions.filter((question, index) => question.correct === session.answers[index]).length;
        const totalQuestions = questions.length;
        const percentage = Math.round((correctAnswers / totalQuestions) * 100);
        const grade = gradeFromScore(percentage);
        const timeTakenSeconds = Math.min(Math.floor((Date.now() - session.startedAt) / 1000), session.durationSeconds);

        try {
            await submitExamAttempt({
                studentId: user.id,
                subjectId: session.subjectId,
                answeredQuestions: answered,
                correctAnswers,
                totalQuestions,
                percentage,
                grade,
                timeTakenSeconds,
                autoSubmitted
            });
        } catch (error) {
            console.error("Failed to save exam attempt:", error);
        }

        // Save result to localStorage and redirect to results page
        const resultData = {
            subjectId: session.subjectId,
            correctAnswers,
            totalQuestions,
            answeredQuestions: answered,
            percentage,
            grade,
            timeTakenSeconds,
            completedAt: new Date().toISOString(),
            autoSubmitted
        };
        localStorage.setItem(STORAGE_KEYS.lastExamResult, JSON.stringify(resultData));

        clearActiveExam();

        // Redirect to results page
        window.location.href = "results.html";
        return;
    }

    function tick() {
        const seconds = remainingSeconds();
        byId("timerValue").textContent = formatDuration(seconds);
        byId("timerStatus").textContent = seconds <= 60 ? "Final minute. Review and submit now." : "Timer is running. Progress is auto-saved on this device.";
        if (seconds <= 60) byId("timerBox").style.background = "linear-gradient(135deg, #fde2d7, #fad7c9)";
        if (seconds === 0) submitExam(true);
    }

    byId("prevBtn").addEventListener("click", () => {
        if (session.currentIndex > 0) {
            session.currentIndex -= 1;
            persistSession();
            renderQuestion();
        }
    });

    byId("nextBtn").addEventListener("click", () => {
        if (session.currentIndex < questions.length - 1) {
            session.currentIndex += 1;
            persistSession();
            renderQuestion();
        }
    });

    byId("submitBtn").addEventListener("click", () => submitExam(false));

    renderQuestion();
    tick();
    timerId = setInterval(tick, 1000);
}

function initPage() {
    switch (document.body.dataset.page) {
        case "register":
            initRegisterPage();
            break;
        case "login":
            initLoginPage();
            break;
        case "dashboard":
            renderDashboard();
            break;
        case "exam":
            initExamPage();
            break;
        case "admin":
            initAdminPage();
            break;
        case "results":
            displayExamResult();
            break;
        case "profile":
            initProfilePage();
            break;
        case "leaderboard":
            initLeaderboard();
            break;
        default:
            break;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    try {
        initPage();
    } catch (error) {
        console.error(error);
        showFatalError("The page hit an unexpected error while loading. Please restart the app from Start_Practice_Exam_App.bat and open http://localhost:3000.");
    }
});

window.addEventListener("error", (event) => {
    console.error("Unhandled page error:", event.error || event.message);
});
