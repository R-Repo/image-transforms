// Runs on index.html — the app's App URL root (headless iframe). Opening the
// editor on the toolbar icon click is a stable, Marketplace-eligible entry
// point (custom context actions are private-app only).
async function init() {
  await miro.board.ui.on('icon:click', async () => {
    const selection = await miro.board.getSelection();
    const images = selection.filter((i) => i.type === 'image');
    if (images.length !== 1) {
      await miro.board.notifications.showError(
        'Select a single image, then click Image Transforms.'
      );
      return;
    }
    await miro.board.ui.openModal({ url: 'app.html', fullscreen: true });
  });
}

init();
