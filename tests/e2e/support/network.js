export async function mockChatReply(page, { reply = "Great — I’ll set the Sponsor field and add them as an approver.", matcher = '**/api/chat' } = {}) {
  await page.route(matcher, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply }),
    });
  });
}

export async function mockRouterSequence(
  page,
  suggestions = [],
  { matcher = '**/api/documents/router', persistLast = true } = {}
) {
  const queue = Array.isArray(suggestions) ? [...suggestions] : [];
  await page.route(matcher, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    let payload;
    if (queue.length > 0) {
      payload = queue.shift();
      if (persistLast && queue.length === 0) {
        queue.push(payload);
      }
    } else {
      payload = suggestions.length > 0 ? suggestions[suggestions.length - 1] : null;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload ?? { type: "charter", confidence: 0 }),
    });
  });
}
