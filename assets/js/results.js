function displayExamResult() {
    if (!requireAuth()) return;
    attachLogout();

    const lastResult = localStorage.getItem(STORAGE_KEYS.lastExamResult);
    if (!lastResult) {
        byId("resultSummary").hidden = true;
        byId("resultError").hidden = false;
        byId("errorMessage").textContent = "No exam result found. Please take an exam first.";
        return;
    }

    try {
        const result = JSON.parse(lastResult);
        const subject = getSubjectMeta(result.subjectId);

        if (!subject) {
            throw new Error("Subject not found in configuration.");
        }

        const { correctAnswers, totalQuestions, timeTakenSeconds, grade, percentage, answeredQuestions } = result;
        const incorrectAnswers = answeredQuestions - correctAnswers;
        const unansweredQuestions = totalQuestions - answeredQuestions;

        // Display header
        byId("subjectName").textContent = subject.name;
        byId("gradeBadge").textContent = grade;
        byId("gradeBadge").className = `result-grade-badge grade-${grade.toLowerCase()}`;

        // Display scores
        byId("scoreDisplay").textContent = `${correctAnswers}/${totalQuestions}`;
        byId("percentageDisplay").textContent = `${percentage}%`;
        byId("durationDisplay").textContent = formatDuration(timeTakenSeconds);
        byId("difficultyDisplay").textContent = getDifficultyLevel(percentage);

        // Calculate progress percentages
        const correctPercent = (correctAnswers / totalQuestions) * 100;
        const unansweredPercent = (unansweredQuestions / totalQuestions) * 100;
        const incorrectPercent = (incorrectAnswers / totalQuestions) * 100;

        // Update progress bars
        byId("correctProgress").style.width = `${correctPercent}%`;
        byId("correctText").textContent = `${correctAnswers} correct (${Math.round(correctPercent)}%)`;

        byId("unansweredProgress").style.width = `${unansweredPercent}%`;
        byId("unansweredText").textContent = `${unansweredQuestions} unanswered (${Math.round(unansweredPercent)}%)`;

        byId("incorrectProgress").style.width = `${incorrectPercent}%`;
        byId("incorrectText").textContent = `${incorrectAnswers} incorrect (${Math.round(incorrectPercent)}%)`;

        // Attach action buttons
        byId("viewHistoryBtn").addEventListener("click", () => {
            window.location.href = "dashboard.html";
        });

        byId("downloadReportBtn").addEventListener("click", () => {
            downloadExamReport(result, subject);
        });

        // Add send email button functionality
        const sendEmailBtn = byId("sendEmailBtn");
        if (sendEmailBtn) {
            sendEmailBtn.addEventListener("click", () => sendResultToEmail(result, subject));
        }

        byId("resultSummary").hidden = false;
        
        // Auto-send email on page load
        sendResultToEmail(result, subject, true);
    } catch (error) {
        byId("resultSummary").hidden = true;
        byId("resultError").hidden = false;
        byId("errorMessage").textContent = `Error loading results: ${error.message}`;
    }
}

function getDifficultyLevel(percentage) {
    if (percentage >= 80) return "Very Easy";
    if (percentage >= 60) return "Easy";
    if (percentage >= 40) return "Moderate";
    if (percentage >= 20) return "Hard";
    return "Very Hard";
}

function downloadExamReport(result, subject) {
    const { correctAnswers, totalQuestions, timeTakenSeconds, grade, percentage, answeredQuestions, completedAt } = result;
    const user = getCurrentUser();
    
    const reportContent = `
EXAM REPORT
================================================================================
Student Name: ${user.fullName}
Student ID: ${user.studentId}
Email: ${user.email}

Exam Details:
Subject: ${subject.name}
Category: ${subject.category}
Total Duration: ${subject.duration} minutes
Time Taken: ${formatDuration(timeTakenSeconds)}
Completed At: ${completedAt}

Performance:
Score: ${correctAnswers}/${totalQuestions}
Percentage: ${percentage}%
Grade: ${grade}
Difficulty Level: ${getDifficultyLevel(percentage)}

Question Breakdown:
- Correct Answers: ${correctAnswers}
- Incorrect Answers: ${answeredQuestions - correctAnswers}
- Unanswered: ${totalQuestions - answeredQuestions}

Recommendation:
${getRecommendation(percentage)}

Generated: ${new Date().toLocaleString()}
================================================================================
    `.trim();

    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(reportContent));
    element.setAttribute("download", `exam-report-${subject.id}-${new Date().getTime()}.txt`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    showAlerts(byId("resultAlerts"), [
        { type: "success", message: "Exam report downloaded successfully." }
    ]);
}

function getRecommendation(percentage) {
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

async function sendResultToEmail(result, subject, autoSend = false) {
    const user = getCurrentUser();
    const alertsContainer = byId("resultAlerts");
    
    if (!alertsContainer) return;

    try {
        // Show sending status
        if (!autoSend) {
            showAlerts(alertsContainer, [
                { type: "info", message: "📧 Sending exam results to email..." }
            ]);
        }

        // Prepare email data
        const emailPayload = {
            studentId: user.id,
            subjectId: result.subjectId,
            subjectName: subject.name,
            correctAnswers: result.correctAnswers,
            totalQuestions: result.totalQuestions,
            answeredQuestions: result.answeredQuestions,
            percentage: result.percentage,
            grade: result.grade,
            timeTakenSeconds: result.timeTakenSeconds
        };

        // Send email via API
        const response = await sendResultEmail(emailPayload);

        if (response.emailSent || response.success) {
            showAlerts(alertsContainer, [
                { 
                    type: "success", 
                    message: `✅ Exam results sent to ${user.email}. Check your inbox!` 
                }
            ]);
        } else {
            throw new Error(response.message || "Failed to send email");
        }
    } catch (error) {
        console.error("Email sending error:", error);
        if (!autoSend) {
            showAlerts(alertsContainer, [
                { 
                    type: "error", 
                    message: `⚠️ Could not send email: ${error.message}` 
                }
            ]);
        }
    }
}

document.addEventListener("DOMContentLoaded", displayExamResult);
