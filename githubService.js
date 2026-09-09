// js/githubService.js

const CONFIG_KEY = 'blockaid_github_config';

/**
 * Save user credentials locally in browser storage
 */
export function saveGitHubConfig(owner, repo, token) {
  const config = { owner, repo, token };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/**
 * Retrieve saved credentials from browser storage
 */
export function getGitHubConfig() {
  const config = localStorage.getItem(CONFIG_KEY);
  return config ? JSON.parse(config) : null;
}

/**
 * Construct HTTP headers with Authorization token
 */
function getHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
}

/**
 * List all JSON files inside a specific folder ("Blueprints" or "Recordings")
 */
export async function listRepositoryFiles(folderPath) {
  const config = getGitHubConfig();
  if (!config) throw new Error('GitHub credentials not configured.');

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${folderPath}`;
  const response = await fetch(url, { headers: getHeaders(config.token) });

  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Failed to list files in ${folderPath}`);

  const files = await response.json();
  return files.filter(file => file.name.endsWith('.json'));
}

/**
 * Fetch and parse a specific JSON file
 */
export async function fetchFileContent(filePath) {
  const config = getGitHubConfig();
  if (!config) throw new Error('GitHub credentials not configured.');

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  const response = await fetch(url, { headers: getHeaders(config.token) });

  if (!response.ok) throw new Error(`Failed to load ${filePath}`);

  const data = await response.json();
  
  // Safely decode UTF-8 Base64 string from GitHub API
  const jsonString = decodeURIComponent(atob(data.content).split('').map(c => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));

  return {
    content: JSON.parse(jsonString),
    sha: data.sha
  };
}

/**
 * Save or overwrite a JSON file in GitHub repository
 */
export async function saveFileToRepository(folderPath, fileName, dataObject, commitMessage) {
  const config = getGitHubConfig();
  if (!config) throw new Error('GitHub credentials not configured.');

  const filePath = `${folderPath}/${fileName}`;
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;

  // Check if file exists to retrieve SHA required for updating
  let sha = null;
  try {
    const existingFile = await fetchFileContent(filePath);
    sha = existingFile.sha;
  } catch (e) {
    // File does not exist yet; creating new file
  }

  // Encode JSON object to UTF-8 Base64
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
    const errorData = await response.json();
    throw new Error(`Save failed: ${errorData.message}`);
  }

  return await response.json();
}

/**
 * Delete a file from GitHub repository
 */
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