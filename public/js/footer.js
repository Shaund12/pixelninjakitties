document.addEventListener('DOMContentLoaded', function () {
    // Load footer component
    fetch('/components/footer.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('footer').innerHTML = data;

            // Update the current year in the copyright notice
            const yearElement = document.getElementById('current-year');
            if (yearElement) {
                yearElement.textContent = new Date().getFullYear();
            }
        })
        .catch(error => {
            console.error('Error loading footer component:', error);
            document.getElementById('footer').innerHTML = '<p class="error">Footer could not be loaded</p>';
        });
});