let contextInfo = null;
let tokenCheckInterval = null;

const TOKEN_TTL = 15 * 60 * 1000;
const TOKEN_RENEW_THRESHOLD = 5 * 60 * 1000; // 剩余5分钟时自动续期
const CHECK_INTERVAL = 5 * 60 * 1000; // 每5分钟检查一次

function storageGet(area, keys) {
  return browser.storage[area].get(keys);
}

function storageSet(area, items) {
  return browser.storage[area].set(items);
}

function parseTokenExpiry(token) {
  try {
    const [timestamp] = token.split('.');
    const issuedAt = Number(timestamp);
    if (Number.isNaN(issuedAt)) return null;
    return issuedAt + TOKEN_TTL;
  } catch (error) {
    return null;
  }
}

// 密码解密函数（与 options.js 保持一致）
async function decryptPassword(encryptedPassword) {
  try {
    const combined = Uint8Array.from(atob(encryptedPassword), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('bookmark-extension-encryption-key-32-byte!'),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const salt = new TextEncoder().encode('bookmark-salt-16-byte');
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    try {
      return atob(encryptedPassword);
    } catch {
      return '';
    }
  }
}

// 检查 token 是否需要续期
function shouldRenewToken(tokenExpiry) {
  if (!tokenExpiry) return false;
  const remaining = tokenExpiry - Date.now();
  return remaining > 0 && remaining < TOKEN_RENEW_THRESHOLD;
}

// 自动续期 token
async function autoRenewToken() {
  const { serverUrl = '', username = '', encryptedPassword = '', autoRenew = false } = await storageGet('local', ['serverUrl', 'username', 'encryptedPassword', 'autoRenew']);
  
  if (!autoRenew || !serverUrl || !username || !encryptedPassword) {
    return false;
  }

  try {
    const password = await decryptPassword(encryptedPassword);
    if (!password) {
      console.error('Failed to decrypt password');
      return false;
    }

    const response = await fetch(`${serverUrl}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      console.error('Auto renew token failed: HTTP', response.status);
      return false;
    }

    const result = await response.json();
    if (!result.success || !result.token) {
      console.error('Auto renew token failed: Invalid response');
      return false;
    }

    const expiry = parseTokenExpiry(result.token);
    await storageSet('local', {
      authToken: result.token,
      tokenExpiry: expiry
    });

    return true;
  } catch (error) {
    console.error('Auto renew token error:', error);
    return false;
  }
}

// 检查并自动续期 token
async function checkAndRenewToken() {
  try {
    const { authToken = '', tokenExpiry = 0, autoRenew = false } = await storageGet('local', ['authToken', 'tokenExpiry', 'autoRenew']);
    
    if (!autoRenew || !authToken) {
      return;
    }

    const expiry = tokenExpiry || parseTokenExpiry(authToken);
    if (!expiry) {
      return;
    }

    // 如果 token 已过期或即将过期，自动续期
    if (Date.now() >= expiry || shouldRenewToken(expiry)) {
      await autoRenewToken();
    }
  } catch (error) {
    console.error('Token check error:', error);
  }
}

// 启动定期检查
function startTokenCheck() {
  // 清除之前的定时器
  if (tokenCheckInterval) {
    clearInterval(tokenCheckInterval);
  }

  // 立即检查一次
  checkAndRenewToken();

  // 设置定期检查
  tokenCheckInterval = setInterval(() => {
    checkAndRenewToken();
  }, CHECK_INTERVAL);
}

// 停止定期检查
function stopTokenCheck() {
  if (tokenCheckInterval) {
    clearInterval(tokenCheckInterval);
    tokenCheckInterval = null;
  }
}

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'save-bookmark',
    title: '添加书签',
    contexts: ['page', 'link']
  });
  
  // 启动 token 检查
  startTokenCheck();
});

// 监听存储变化，如果启用/禁用自动续期，重新启动/停止检查
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.autoRenew !== undefined || changes.authToken !== undefined) {
      const autoRenew = changes.autoRenew;
      const authToken = changes.authToken;
      if (autoRenew && autoRenew.newValue && authToken && authToken.newValue) {
        startTokenCheck();
      } else if ((autoRenew && !autoRenew.newValue) || (authToken && !authToken.newValue)) {
        stopTokenCheck();
      }
    }
  }
});

// 扩展启动时检查配置并启动检查
browser.runtime.onStartup.addListener(() => {
  storageGet('local', ['autoRenew', 'authToken']).then(({ autoRenew = false, authToken = '' }) => {
    if (autoRenew && authToken) {
      startTokenCheck();
    }
  });
});

async function openPopup() {
  if (browser.browserAction && browser.browserAction.openPopup) {
    try {
      await browser.browserAction.openPopup();
      return;
    } catch (error) {
      // fall back
    }
  }

  await browser.windows.create({
    url: browser.runtime.getURL('popup.html'),
    type: 'popup',
    width: 420,
    height: 640
  });
}

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-bookmark') {
    contextInfo = {
      url: info.linkUrl || info.pageUrl || (tab ? tab.url : ''),
      title: info.selectionText || (tab ? tab.title : ''),
      from: 'contextMenu'
    };
    openPopup();
    setTimeout(() => {
      contextInfo = null;
    }, 5000);
  }
});

browser.runtime.onMessage.addListener(request => {
  if (request.type === 'request-context-info') {
    const info = contextInfo;
    contextInfo = null;
    return Promise.resolve(info);
  }
});

browser.browserAction.onClicked.addListener(tab => {
  contextInfo = {
    url: tab.url || '',
    title: tab.title || '',
    from: 'browserAction'
  };
});
