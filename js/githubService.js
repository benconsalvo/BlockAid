// githubService.js

const CONFIG_KEY = 'blockaid_github_config';

export function saveGitHubConfig(owner, repo, token) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ owner, repo, token }));
}

export function getGitHubConfig() {
  const config = localStorage.getItem(CONFIG_KEY);
  return config ? JSON.parse(config) : null;
}

function getHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
}

export async function listRepositoryFiles(folderPath) {
  const config = getGitHubConfig();
  if (!config) throw new Error('GitHub credentials not configured.');

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${folderPath}`;
  const response = await fetch(url, { headers: getHeaders(config.token) });

  if (response.status === 404) return [];
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }

  const files = await response.json();
  return files.filter(file => file.name.endsWith('.json'));
}

export async function fetchFileContent(filePath) {
  const config = getGitHubConfig();
  if (!config) throw new Error('GitHub credentials not configured.');

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  const response = await fetch(url, { headers: getHeaders(config.token) });

  if (!response.ok) throw new Error(`Failed to load ${filePath}`);

  const data = await response.json();
  const jsonString = decodeURIComponent(atob(data.content).split('').map(c => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));

  return {
    content: JSON.parse(jsonString),
    sha: data.sha
  };
}

export async function saveFileToRepository(folderPath, fileName, dataObject, commitMessage) {
  const config = getGitHubConfig();
  if (!config) throw new Error('GitHub credentials not configured.');

  const filePath = `${folderPath}/${fileName}`;
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;

  let sha = null;
  try {
    const existingFile = await fetchFileContent(filePath);
    sha = existingFile.sha;
  } catch (e) {
    // File does not exist yet
  }

  const jsonString = JSON.stringify(dataObject, null, 2);
  const base64Content = btoa(encodeURIComponent(jsonString).replace(/%([0-9A-F]{2})/g, (match, p1) => {
    return String.fromCharCode('0x' + p1);
  }));

  const payload = {
    message: commitMessage,
    content: base64Content,
    ...(sha && { sha })
  };

  const response = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(config.token),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }

  return await response.json();
}

export async function deleteFileFromRepository(filePath, commitMessage = 'Delete file') {
  const config = getGitHubConfig();
  if (!config) throw new Error('GitHub credentials not configured.');

  const existingFile = await fetchFileContent(filePath);
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders(config.token),
    body: JSON.stringify({
      message: commitMessage,
      sha: existingFile.sha
    })
  });

  if (!response.ok) throw new Error(`Failed to delete ${filePath}`);
  return true;
}