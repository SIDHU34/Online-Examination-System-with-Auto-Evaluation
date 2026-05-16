async function initLeaderboard() {
    if (!requireAuth()) return;
    attachLogout();

    const user = getCurrentUser();
    const filterSelect = byId("leaderboardFilter");
    
    // Populate filter options
    filterSelect.innerHTML += SUBJECTS.map((subject) => 
        `<option value="${subject.id}">${subject.name}</option>`
    ).join("");

    async function loadLeaderboard(subjectId = "") {
        try {
            // Fetch all student attempts from admin API
            // Note: This is a limitation - we're using admin API which requires authentication
            // In production, this would have a public API endpoint
            
            // For now, we'll show a local leaderboard based on local storage
            displayLocalLeaderboard(subjectId);
        } catch (error) {
            showAlerts(byId("leaderboardAlerts"), [
                { type: "info", message: "Leaderboard shows top performers from your cohort" }
            ]);
            displayLocalLeaderboard(subjectId);
        }
    }

    function displayLocalLeaderboard(subjectId) {
        // In a real app, this would fetch from /api/admin/leaderboard endpoint
        // For now, we create a mock leaderboard
        
        const attempts = [];
        const students = {};
        
        // This would be populated from the admin API in production
        // Mock data for demonstration:
        const mockData = [
            { name: "Aarav Sharma", studentId: "BCA2026001", bestScore: 92, avgScore: 85, attempts: 5 },
            { name: "Priya Patel", studentId: "BCA2026002", bestScore: 88, avgScore: 82, attempts: 4 },
            { name: "Raj Kumar", studentId: "BCA2026003", bestScore: 85, avgScore: 78, attempts: 6 },
            { name: "Neha Singh", studentId: "BCA2026004", bestScore: 90, avgScore: 86, attempts: 5 },
            { name: "Amit Verma", studentId: "BCA2026005", bestScore: 82, avgScore: 75, attempts: 3 }
        ];

        // Sort by best score (descending)
        const sorted = mockData.sort((a, b) => b.bestScore - a.bestScore);

        // Render leaderboard
        const html = sorted.map((entry, index) => {
            const isCurrentUser = entry.studentId === user.studentId;
            const rowClass = isCurrentUser ? "current-user" : "";
            
            return `
                <tr class="${rowClass}">
                    <td style="text-align: center; font-weight: 700;">#${index + 1}</td>
                    <td>${entry.name} ${isCurrentUser ? " <span style='color: var(--primary); font-size: 0.8em;'>(You)</span>" : ""}</td>
                    <td>${entry.studentId}</td>
                    <td style="text-align: center;">${entry.attempts}</td>
                    <td style="text-align: center; color: var(--success); font-weight: 600;">${entry.bestScore}%</td>
                    <td style="text-align: center;">${entry.avgScore}%</td>
                </tr>
            `;
        }).join("");

        byId("leaderboardBody").innerHTML = html;

        // Find and display current user's rank
        const userIndex = sorted.findIndex(e => e.studentId === user.studentId);
        if (userIndex >= 0) {
            const userEntry = sorted[userIndex];
            byId("userRank").textContent = `#${userIndex + 1} of ${sorted.length}`;
            byId("userBestScore").textContent = `${userEntry.bestScore}%`;
            byId("userAvgScore").textContent = `${userEntry.avgScore}%`;
            byId("userAttempts").textContent = userEntry.attempts;
        } else {
            byId("userRank").textContent = "Not ranked yet";
            byId("userBestScore").textContent = "0%";
            byId("userAvgScore").textContent = "0%";
            byId("userAttempts").textContent = "0";
        }
    }

    // Handle filter change
    filterSelect.addEventListener("change", (e) => {
        loadLeaderboard(e.target.value);
    });

    // Initial load
    loadLeaderboard();
}

document.addEventListener("DOMContentLoaded", initLeaderboard);
