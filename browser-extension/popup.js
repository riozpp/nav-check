const TOKEN_TTL = 15 * 60 * 1000;
const TOKEN_RENEW_THRESHOLD = 5 * 60 * 1000; // 剩余5分钟时自动续期
let settings = {};
let categories = [];

function storageGet(area, keys) {
  return new Promise(resolve => chrome.storage[area].get(keys, resolve));
}

function storageSet(area, items) {
  return new Promise(resolve => chrome.storage[area].set(items, resolve));
}

function storageRemove(area, keys) {
  return new Promise(resolve => chrome.storage[area].remove(keys, resolve));
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

    // 更新 settings 对象
    settings.authToken = result.token;
    settings.tokenExpiry = expiry;

    return true;
  } catch (error) {
    console.error('Auto renew token error:', error);
    return false;
  }
}

// 确保 token 有效（检查并自动续期）
async function ensureTokenValid() {
  if (!settings.authToken || !settings.tokenExpiry) {
    return false;
  }

  const now = Date.now();
  if (now > settings.tokenExpiry) {
    // Token 已过期，尝试自动续期
    return await autoRenewToken();
  }

  if (shouldRenewToken(settings.tokenExpiry)) {
    // Token 即将过期，自动续期
    return await autoRenewToken();
  }

  return true;
}

async function loadSettings() {
  const result = await storageGet('local', ['serverUrl', 'authToken', 'tokenExpiry', 'autoRenew']);
  let { serverUrl = '', authToken = '', tokenExpiry = 0, autoRenew = false } = result;

  if (authToken) {
    const expiry = tokenExpiry || parseTokenExpiry(authToken);
    if (!expiry || Date.now() > expiry) {
      // Token 已过期，如果启用了自动续期，尝试续期
      if (autoRenew) {
        const renewed = await autoRenewToken();
        if (renewed) {
          // 重新获取续期后的 token
          const { authToken: newToken, tokenExpiry: newExpiry } = await storageGet('local', ['authToken', 'tokenExpiry']);
          if (newToken && newExpiry && Date.now() < newExpiry) {
            authToken = newToken;
            tokenExpiry = newExpiry;
          } else {
            await storageRemove('local', ['authToken', 'tokenExpiry']);
            authToken = '';
            tokenExpiry = 0;
          }
        } else {
          await storageRemove('local', ['authToken', 'tokenExpiry']);
          authToken = '';
          tokenExpiry = 0;
        }
      } else {
        await storageRemove('local', ['authToken', 'tokenExpiry']);
        authToken = '';
        tokenExpiry = 0;
      }
    }
  }

  settings = { serverUrl, authToken, tokenExpiry, autoRenew };
  return settings;
}

function showSection(sectionId) {
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('form-section').classList.add('hidden');
  document.getElementById('loading-section').classList.add('hidden');
  document.getElementById(sectionId).classList.remove('hidden');
}

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = `status-message status-${type}`;
  statusEl.classList.remove('hidden');
  
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 4000);
}

async function loadCategories() {
  try {
    // 确保 token 有效
    await ensureTokenValid();
    
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    if (settings.authToken) {
      headers.set('Authorization', `Bearer ${settings.authToken}`);
    }

    const response = await fetch(`${settings.serverUrl}/api/categories`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        await storageRemove('local', ['authToken', 'tokenExpiry']);
        settings.authToken = '';
      }
      throw new Error('Failed to load categories');
    }
    
    const result = await response.json();
    const rawCategories = result.data || [];

    const categoryMap = new Map();
    rawCategories.forEach(cat => {
      categoryMap.set(cat.id, { ...cat });
    });

    categories = rawCategories.map(cat => {
      const base = categoryMap.get(cat.id);
      const segments = [];
      const visited = new Set();
      let current = base;

      while (current) {
        if (visited.has(current.id)) {
          break;
        }
        visited.add(current.id);
        segments.unshift(current.name);
        if (!current.parent_id) {
          break;
        }
        current = categoryMap.get(current.parent_id);
      }

      return {
        ...base,
        path: segments.join(' / ')
      };
    });
    
    const select = document.getElementById('category');
    select.innerHTML = '<option value="">选择分类...</option>';
    
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = String(cat.id);
      option.textContent = cat.path || cat.name;
      select.appendChild(option);
    });
    
    if (categories.length > 0) {
      select.value = String(categories[0].id);
    }
    
    return true;
  } catch (error) {
    console.error('Failed to load categories:', error);
    return false;
  }
}

async function getCurrentTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      resolve(tabs && tabs.length ? tabs[0] : null);
    });
  });
}

async function maybeUseContextInfo() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'request-context-info' }, info => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(info || null);
    });
  });
}

async function generateDescription() {
  // 确保 token 有效
  await ensureTokenValid();
  
  const titleEl = document.getElementById('title');
  const urlEl = document.getElementById('url');
  const descEl = document.getElementById('description');
  const aiBtn = document.getElementById('ai-btn');
  
  if (!titleEl.value || !urlEl.value) {
    showStatus('请先填写标题和URL', 'error');
    return;
  }
  
  aiBtn.disabled = true;
  aiBtn.innerHTML = '<span>⏳ 生成中...</span>';
  
  try {
    const response = await fetch(`${settings.serverUrl}/api/ai/generate-description`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.authToken}`
      },
      body: JSON.stringify({
        name: titleEl.value,
        url: urlEl.value
      })
    });
    
    const result = await response.json();
    
    if (result.success && result.description) {
      descEl.value = result.description;
      showStatus('✅ AI描述生成成功', 'success');
    } else {
      showStatus(result.error || 'AI描述生成失败', 'error');
    }
  } catch (error) {
    console.error('AI generate error:', error);
    showStatus('AI功能暂时不可用', 'error');
  } finally {
    aiBtn.disabled = false;
    aiBtn.innerHTML = '<span>🤖 AI生成描述</span>';
  }
}

async function suggestCategory() {
  // 确保 token 有效
  await ensureTokenValid();
  
  const titleEl = document.getElementById('title');
  const urlEl = document.getElementById('url');
  const descEl = document.getElementById('description');
  const categoryEl = document.getElementById('category');
  const aiCategoryBtn = document.getElementById('ai-category-btn');
  
  if (!titleEl.value || !urlEl.value) {
    showStatus('请先填写标题和URL', 'error');
    return;
  }
  
  if (categories.length === 0) {
    showStatus('没有可用的分类', 'error');
    return;
  }
  
  aiCategoryBtn.disabled = true;
  aiCategoryBtn.innerHTML = '<span>⏳ 推荐中...</span>';
  
  try {
    const response = await fetch(`${settings.serverUrl}/api/ai/suggest-category`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.authToken}`
      },
      body: JSON.stringify({
        name: titleEl.value,
        url: urlEl.value,
        description: descEl.value || '',
        categories: categories.map(cat => ({
          id: cat.id,
          name: cat.name,
          path: cat.path
        }))
      })
    });
    
    const result = await response.json();
    
    if (result.success && result.categoryId !== undefined && result.categoryId !== null) {
      const categoryId = String(result.categoryId);
      const matchedCategory = categories.find(cat => String(cat.id) === categoryId);

      if (matchedCategory) {
        categoryEl.value = categoryId;
        const reason = result.reason ? `（${result.reason}）` : '';
        showStatus(`✅ 推荐分类：${matchedCategory.path}${reason}`, 'success');
      } else {
        showStatus('AI推荐的分类不存在，请刷新分类后重试', 'error');
      }
    } else {
      showStatus(result.error || 'AI推荐分类失败', 'error');
    }
  } catch (error) {
    console.error('AI suggest category error:', error);
    showStatus('AI功能暂时不可用', 'error');
  } finally {
    aiCategoryBtn.disabled = false;
    aiCategoryBtn.innerHTML = '<span>🏷️ AI推荐分类</span>';
  }
}

async function saveBookmark(event) {
  event.preventDefault();
  
  // 确保 token 有效
  await ensureTokenValid();
  
  const title = document.getElementById('title').value.trim();
  const url = document.getElementById('url').value.trim();
  const description = document.getElementById('description').value.trim();
  const categoryId = document.getElementById('category').value;
  const isPrivate = document.getElementById('is-private').checked;
  
  if (!title || !url || !categoryId) {
    showStatus('请填写所有必填项', 'error');
    return;
  }
  
  const saveBtn = document.getElementById('save-btn');
  const saveText = document.getElementById('save-text');
  saveBtn.disabled = true;
  saveText.textContent = '保存中...';
  
  try {
    const response = await fetch(`${settings.serverUrl}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.authToken}`
      },
      body: JSON.stringify({
        name: title,
        url: url,
        description: description || null,
        icon: null,
        category_id: parseInt(categoryId, 10),
        is_private: isPrivate
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showStatus('✅ 书签保存成功', 'success');
      setTimeout(() => {
        window.close();
      }, 1000);
    } else if (response.status === 409 && result.duplicate) {
      // 处理重复 URL 的情况
      const categoryName = result.existingBookmark?.category_name || '未知分类';
      showStatus(`⚠️ 该 URL 已存在于"${categoryName}"分类中`, 'warning');
      saveBtn.disabled = false;
      saveText.textContent = '保存书签';
    } else {
      showStatus(result.error || '保存失败', 'error');
      saveBtn.disabled = false;
      saveText.textContent = '保存书签';
    }
  } catch (error) {
    console.error('Save error:', error);
    showStatus('网络错误，请检查服务器地址', 'error');
    saveBtn.disabled = false;
    saveText.textContent = '保存书签';
  }
}

async function init() {
  showSection('loading-section');
  
  await loadSettings();
  
  if (!settings.serverUrl || !settings.authToken) {
    showSection('auth-section');
    return;
  }
  
  const categoriesLoaded = await loadCategories();
  
  if (!categoriesLoaded) {
    showSection('auth-section');
    return;
  }
  
  const contextInfo = await maybeUseContextInfo();
  const tab = contextInfo || await getCurrentTab();
  
  if (tab) {
    document.getElementById('title').value = tab.title || '';
    document.getElementById('url').value = tab.url || '';
  }
  
  showSection('form-section');
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  
  document.getElementById('goto-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById('bookmark-form').addEventListener('submit', saveBookmark);
  
  document.getElementById('ai-btn').addEventListener('click', generateDescription);
  
  document.getElementById('ai-category-btn').addEventListener('click', suggestCategory);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.serverUrl || changes.authToken)) {
    init();
  }
});
