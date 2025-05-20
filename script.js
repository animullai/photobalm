
function previewTool(toolName) {
    const preview = document.getElementById('preview');
    preview.textContent = `Previewing: ${toolName.charAt(0).toUpperCase() + toolName.slice(1)} Tool`;
}
