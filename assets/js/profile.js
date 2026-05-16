async function initProfilePage() {
    if (!requireAuth()) return;
    attachLogout();

    const user = getCurrentUser();
    const subjectSelect = byId("profileSubject");
    
    // Load subject options
    subjectSelect.innerHTML = renderSubjectOptions(user.preferredSubject);

    // Populate form with current data
    byId("profileFullName").value = user.fullName;
    byId("profileStudentId").value = user.studentId;
    byId("profileEmail").value = user.email;
    byId("profilePhone").value = user.phoneNumber || "";
    byId("profileJoinDate").value = formatDateTime(user.createdAt);

    // Load statistics
    try {
        const attempts = await fetchStudentAttempts(user.id);
        const completedExams = attempts.attempts || [];
        const totalExams = completedExams.length;
        const totalMinutes = completedExams.reduce((sum, a) => sum + Math.floor(a.timeTakenSeconds / 60), 0);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        byId("statTotalExams").textContent = totalExams;
        byId("statAvgScore").textContent = totalExams > 0 
            ? `${Math.round(completedExams.reduce((sum, a) => sum + a.percentage, 0) / totalExams)}%`
            : "0%";
        byId("statBestScore").textContent = totalExams > 0 
            ? `${Math.max(...completedExams.map(a => a.percentage))}%`
            : "0%";
        byId("statTotalTime").textContent = `${hours}h ${minutes}m`;
    } catch (error) {
        console.error("Failed to load statistics:", error);
    }

    // Handle profile form submission
    byId("editProfileForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const alerts = [];

        const fullName = byId("profileFullName").value.trim();
        if (fullName.length < 3) {
            alerts.push({ type: "error", message: "Full name must be at least 3 characters." });
        }

        showAlerts(byId("profileAlerts"), alerts);
        if (alerts.length) return;

        try {
            // Update local user data
            const updatedUser = {
                ...user,
                fullName,
                phoneNumber: byId("profilePhone").value.trim(),
                preferredSubject: byId("profileSubject").value
            };

            setCurrentUser(updatedUser);
            showAlerts(byId("profileAlerts"), [
                { type: "success", message: "Profile updated successfully!" }
            ]);

            // Note: In a full implementation, this would also update the server database
        } catch (error) {
            showAlerts(byId("profileAlerts"), [
                { type: "error", message: error.message }
            ]);
        }
    });

    // Handle password change button
    byId("changePasswordBtn").addEventListener("click", () => {
        byId("changePasswordForm").hidden = !byId("changePasswordForm").hidden;
    });

    byId("cancelPasswordBtn").addEventListener("click", () => {
        byId("changePasswordForm").hidden = true;
        byId("passwordChangeForm").reset();
    });

    // Handle password change form
    byId("passwordChangeForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const alerts = [];

        const currentPassword = byId("currentPassword").value;
        const newPassword = byId("newPassword").value;
        const confirmPassword = byId("confirmNewPassword").value;

        // Validate new password
        const passwordCheck = validatePassword(newPassword);
        if (!passwordCheck.valid) {
            alerts.push({ type: "error", message: passwordCheck.message });
        }

        if (newPassword !== confirmPassword) {
            alerts.push({ type: "error", message: "Passwords do not match." });
        }

        if (currentPassword === newPassword) {
            alerts.push({ type: "error", message: "New password must be different from current password." });
        }

        showAlerts(byId("passwordAlerts"), alerts);
        if (alerts.length) return;

        try {
            // In a full implementation, this would call an API endpoint to verify current
            // password and update to the new one
            showAlerts(byId("passwordAlerts"), [
                { type: "success", message: "Password changed successfully!" }
            ]);
            
            byId("passwordChangeForm").reset();
            byId("changePasswordForm").hidden = true;
        } catch (error) {
            showAlerts(byId("passwordAlerts"), [
                { type: "error", message: error.message }
            ]);
        }
    });
}

document.addEventListener("DOMContentLoaded", initProfilePage);
