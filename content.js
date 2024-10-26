// Example of a content script that would run automatically on matching pages
console.log("Content script loaded - this runs automatically on matching pages");

// Example of how to listen for page events
document.addEventListener('DOMContentLoaded', () => {
    console.log("Page finished loading - content scripts can react to page events");
});