// js/app.js

import { 
  saveGitHubConfig, 
  getGitHubConfig, 
  listRepositoryFiles, 
  deleteFileFromRepository 
} from './githubService.js';

document.addEventListener('DOMContentLoaded', async () => {
  const settingsModal = document.getElementById('settings-modal');
  const openSettingsBtn = document.getElementById('btn-open-settings');
  const closeSettingsBtn = document.getElementById('btn-close-settings');
  const saveSettingsBtn = document.getElementById('btn-save-settings');
  
  const ownerInput = document.getElementById('gh-owner');
  const repoInput = document.getElementById('gh-repo');
  const tokenInput = document.getElementById('gh-token');
  const statusMsg = document.getElementById('status-message');

  const blueprintsList = document.getElementById('blueprints-list');
  const recordingsList = document.getElementById('recordings-list');
  const createBlueprintBtn = document.getElementById('btn-create-blueprint');

  // Load existing credentials
  const config = getGitHubConfig();
  if (config) {
    ownerInput.value = config.owner || '';
    repoInput.value = config.repo || '';
    tokenInput.value = config.token || '';
    loadData();
  } else {
    settingsModal.style.display = 'flex';
  }

  // Toggle Settings Modal
  openSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  // Save Settings
  saveSettingsBtn.addEventListener('click', async () => {
    const owner = ownerInput.value.trim();
    const repo = repoInput.value.trim();
    const token = tokenInput.value.trim();

    if (!owner || !repo || !token) {
      statusMsg.textContent = 'Please fill in all fields.';
      statusMsg.style.color = '#FF6B6B';
      return;
    }

    saveGitHubConfig(owner, repo, token);
    statusMsg.textContent = 'Testing connection...';
    statusMsg.style.color = '#D4AF37';

    try {
      await listRepositoryFiles('Blueprints');
      statusMsg.textContent = 'Connected successfully!';
      statusMsg.style.color = '#51CF66';
      setTimeout(() => {
        settingsModal.style.display = 'none';
        loadData();
      }, 1000);
    } catch (err) {
      statusMsg.textContent = `Connection failed: ${err.message}`;
      statusMsg.style.color = '#FF6B6B';
    }
  });

  // Fetch and Render Blueprints & Recordings
  async function loadData() {
    await renderBlueprints();
    await renderRecordings();
  }

  async function renderBlueprints() {
    blueprintsList.innerHTML = '<li class="empty-message">Loading blueprints...</li>';
    try {
      const files = await listRepositoryFiles('Blueprints');
      if (files.length === 0) {
        blueprintsList.innerHTML = '<li class="empty-message">No saved blueprints found.</li>';
        return;
      }

      blueprintsList.innerHTML = '';
      files.forEach(file => {
        const displayName = file.name.replace('.json', '');
        const li = document.createElement('li');
        li.className = 'item-row';
        li.innerHTML = `
          <span class="item-name">${displayName}</span>
          <div class="item-actions">
            <button class="btn-secondary btn-edit-bp" data-file="${file.path}">Edit</button>
            <button class="btn-danger btn-delete-bp" data-file="${file.path}">Delete</button>
            <button class="btn-primary btn-create-blocking" data-file="${file.path}">Create New Blocking</button>
          </div>
        `;
        blueprintsList.appendChild(li);
      });

      // Attach button event listeners
      document.querySelectorAll('.btn-delete-bp').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const filePath = e.target.getAttribute('data-file');
          if (confirm(`Delete blueprint ${filePath}?`)) {
            await deleteFileFromRepository(filePath, `Delete blueprint ${filePath}`);
            renderBlueprints();
          }
        });
      });

      document.querySelectorAll('.btn-edit-bp').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const filePath = e.target.getAttribute('data-file');
          alert(`Edit Blueprint Canvas will open in Phase 3 for: ${filePath}`);
        });
      });

      document.querySelectorAll('.btn-create-blocking').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const filePath = e.target.getAttribute('data-file');
          alert(`Recording Canvas will open in Phase 4 for blueprint: ${filePath}`);
        });
      });

    } catch (err) {
      blueprintsList.innerHTML = `<li class="empty-message" style="color: #FF6B6B;">Error: ${err.message}</li>`;
    }
  }

  async function renderRecordings() {
    recordingsList.innerHTML = '<li class="empty-message">Loading saved blockings...</li>';
    try {
      const files = await listRepositoryFiles('Recordings');
      if (files.length === 0) {
        recordingsList.innerHTML = '<li class="empty-message">No saved blockings found.</li>';
        return;
      }

      recordingsList.innerHTML = '';
      files.forEach(file => {
        const displayName = file.name.replace('.json', '');
        const li = document.createElement('li');
        li.className = 'item-row';
        li.innerHTML = `
          <span class="item-name">${displayName}</span>
          <div class="item-actions">
            <button class="btn-secondary btn-edit-rec" data-file="${file.path}">Edit</button>
            <button class="btn-danger btn-delete-rec" data-file="${file.path}">Delete</button>
          </div>
        `;
        recordingsList.appendChild(li);
      });

      document.querySelectorAll('.btn-delete-rec').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const filePath = e.target.getAttribute('data-file');
          if (confirm(`Delete blocking ${filePath}?`)) {
            await deleteFileFromRepository(filePath, `Delete blocking ${filePath}`);
            renderRecordings();
          }
        });
      });

      document.querySelectorAll('.btn-edit-rec').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const filePath = e.target.getAttribute('data-file');
          alert(`Edit Blocking Canvas will open in Phase 4 for: ${filePath}`);
        });
      });

    } catch (err) {
      recordingsList.innerHTML = `<li class="empty-message" style="color: #FF6B6B;">Error: ${err.message}</li>`;
    }
  }

  createBlueprintBtn.addEventListener('click', () => {
    alert('New Blueprint Canvas will open in Phase 3.');
  });
});