// app.js

import { saveGitHubConfig, getGitHubConfig, listRepositoryFiles } from './githubService.js';

document.addEventListener('DOMContentLoaded', () => {
  const ownerInput = document.getElementById('gh-owner');
  const repoInput = document.getElementById('gh-repo');
  const tokenInput = document.getElementById('gh-token');
  const saveBtn = document.getElementById('btn-save');
  const statusMsg = document.getElementById('status-message');

  const currentConfig = getGitHubConfig();
  if (currentConfig) {
    ownerInput.value = currentConfig.owner || '';
    repoInput.value = currentConfig.repo || '';
    tokenInput.value = currentConfig.token || '';
  }

  saveBtn.addEventListener('click', async () => {
    const githubOwner = ownerInput.value.trim();
    const githubRepo = repoInput.value.trim();
    const githubToken = tokenInput.value.trim();

    if (!githubOwner || !githubRepo || !githubToken) {
      statusMsg.textContent = 'Please fill in all fields.';
      statusMsg.style.color = '#FF6B6B';
      return;
    }

    saveGitHubConfig(githubOwner, githubRepo, githubToken);
    statusMsg.textContent = 'Testing connection...';
    statusMsg.style.color = '#D4AF37';

    try {
      await listRepositoryFiles('Blueprints');
      statusMsg.textContent = 'Connection successful! Ready for Phase 2.';
      statusMsg.style.color = '#51CF66';
    } catch (err) {
      statusMsg.textContent = `Connection failed: ${err.message}`;
      statusMsg.style.color = '#FF6B6B';
    }
  });
});