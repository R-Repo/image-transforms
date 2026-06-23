// Runs on index.html (the app's App URL root). Registers the context-menu
// action and opens the editor modal when it fires.
async function init() {
  await miro.board.ui.on('custom:warp-image', async () => {
    await miro.board.ui.openModal({
      url: 'app.html',
      fullscreen: true,
    });
  });

  await miro.board.experimental.action.register({
    event: 'warp-image',
    ui: {
      label: 'Warp image…',
      icon: 'crop',
      description: 'Perspective-warp this image',
    },
    scope: 'local',
    predicate: { type: 'image' },
    contexts: { item: {} },
  });
}

init();
