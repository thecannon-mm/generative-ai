/*
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { initGenerator, getGeneratorContent } from './features/generator.js';
import { initEnhancer, getEnhancerContent } from './features/enhancer.js';
import { initConverter, getConverterContent } from './features/converter.js';
import { initEval, getEvalContent } from './features/eval.js';
import { initAlignmentEval, getAlignmentEvalContent } from './features/alignment-eval.js';
import { initGallery, getGalleryContent } from './features/gallery.js';
import { initTimeline, getTimelineContent } from './features/timeline.js';

const tabs = {
    generator: { getContent: getGeneratorContent, init: initGenerator, needsAuth: true },
    enhancer: { getContent: getEnhancerContent, init: initEnhancer, needsAuth: true },
    converter: { getContent: getConverterContent, init: initConverter, needsAuth: true },
    'alignment-eval': { getContent: getAlignmentEvalContent, init: initAlignmentEval, needsAuth: true },
    eval: { getContent: getEvalContent, init: initEval, needsAuth: true },
    gallery: { getContent: getGalleryContent, init: initGallery, needsAuth: false },
    timeline: { getContent: getTimelineContent, init: initTimeline, needsAuth: true }
};

// Dark Mode Functions
function initDarkMode() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const lightIcon = document.getElementById('theme-toggle-light-icon');
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    
    if (!themeToggleBtn || !lightIcon || !darkIcon) {
        console.warn('Dark mode elements not found');
        return;
    }
    
    // Check for saved theme preference or default to light mode  
    const savedTheme = localStorage.getItem('theme');
    
    // Set initial theme - defaults to light mode
    let currentTheme = savedTheme || 'light';
    applyTheme(currentTheme);
    
    // Toggle theme function
    function toggleTheme() {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(currentTheme);
        localStorage.setItem('theme', currentTheme);
        
        // Show notification about theme change
        showNotification(`Switched to ${currentTheme} mode`, 'info', 2000);
    }
    
    // Apply theme function
    function applyTheme(theme) {
        const html = document.documentElement;
        const toggleBtn = document.getElementById('theme-toggle');
        
        if (theme === 'dark') {
            html.classList.add('dark');
            // In dark mode, show sun icon (click to go to light)
            lightIcon.style.display = 'block';
            darkIcon.style.display = 'none';
            if (toggleBtn) toggleBtn.title = 'Switch to light mode';
        } else {
            html.classList.remove('dark');
            // In light mode, show moon icon (click to go to dark)  
            lightIcon.style.display = 'none';
            darkIcon.style.display = 'block';
            if (toggleBtn) toggleBtn.title = 'Switch to dark mode';
        }
        
        // Update CSS custom properties for smoother transitions
        updateThemeProperties(theme);
    }
    
    // Update CSS custom properties
    function updateThemeProperties(theme) {
        const root = document.documentElement;
        
        if (theme === 'dark') {
            root.style.setProperty('--theme-bg', '#0f172a');
            root.style.setProperty('--theme-text', '#f1f5f9');
            root.style.setProperty('--theme-border', '#334155');
        } else {
            root.style.setProperty('--theme-bg', '#ffffff');
            root.style.setProperty('--theme-text', '#1e293b');
            root.style.setProperty('--theme-border', '#e2e8f0');
        }
    }
    

    
    // Add event listener to toggle button
    themeToggleBtn.addEventListener('click', toggleTheme);
    
    // Add smooth transition class after initial theme is set
    setTimeout(() => {
        document.body.classList.add('transition-colors', 'duration-300');
        
        // Add transitions to other elements
        const elementsToTransition = document.querySelectorAll('nav, .main-tab, input, textarea, select, button');
        elementsToTransition.forEach(element => {
            element.classList.add('transition-colors', 'duration-300');
        });
    }, 100);
    
    console.log(`Theme system initialized. Current theme: ${currentTheme} (defaults to light mode)`);
}

// This function is async to handle fetching HTML templates.
async function showMainTab(tabName) {
    const feature = tabs[tabName];
    if (!feature) {
        console.warn(`Tab ${tabName} not found`);
        return;
    }

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Load tab content asynchronously.
    mainContent.innerHTML = await feature.getContent();
    feature.init();

    // Update active tab styling
    Object.keys(tabs).forEach(tabKey => {
        const tabEl = document.getElementById(`${tabKey}-main-tab`);
        if (tabEl) {
            tabEl.classList.toggle('main-tab-active', tabKey === tabName);
        }
    });

    // Add fade-in animation to content
    mainContent.classList.add('fade-in');
    setTimeout(() => {
        mainContent.classList.remove('fade-in');
    }, 500);

    // Show or hide auth section based on tab requirements
    const authSectionContainer = document.getElementById('auth-section-container');
    if (authSectionContainer) {
        authSectionContainer.style.display = feature.needsAuth ? 'block' : 'none';
        
        // Update status indicator
        const statusEl = document.getElementById('access-token-status');
        if (statusEl && feature.needsAuth) {
            const method = document.getElementById('auth-method-select')?.value;
            statusEl.textContent = method === 'api-key' ? 'Using API Key' : 'Using Access Token';
        }
    }
    
    console.log(`Switched to ${tabName} tab`);
}

// Token validation
async function validateAccessToken() {
    const accessToken = document.getElementById('access-token-input').value;
    const projectId = document.getElementById('project-id-input').value;
    const validateBtn = document.getElementById('validate-token-btn');
    const statusEl = document.getElementById('access-token-status');

    if (!accessToken) {
        showNotification('Please enter an access token.', 'error');
        return;
    }

    const originalBtnText = validateBtn.textContent;
    validateBtn.disabled = true;
    validateBtn.textContent = 'Validating...';

    try {
        const response = await fetch('/api/validate-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, projectId })
        });

        const data = await response.json();
        if (data.valid) {
            showNotification('Token is valid!', 'success');
            if (statusEl) {
                statusEl.textContent = `Token valid for project: ${projectId}`;
                statusEl.classList.add('text-green-500');
            }
        } else {
            showNotification('Token is invalid or expired.', 'error');
            if (statusEl) {
                statusEl.textContent = 'Invalid token';
                statusEl.classList.add('text-red-500');
            }
        }
    } catch (error) {
        console.error('Validation error:', error);
        showNotification('Failed to validate token.', 'error');
    } finally {
        validateBtn.disabled = false;
        validateBtn.textContent = originalBtnText;
    }
}

// Enhanced notification system with dark mode support
function showNotification(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('notification-toast');
    
    if (!toast) {
        console.warn('Notification toast element not found');
        return;
    }
    
    // Clear any existing classes and timers
    clearTimeout(toast.hideTimer);
    toast.className = '';
    
    // Set the message
    toast.textContent = message;
    
    // Base classes for the toast
    const baseClasses = 'fixed bottom-20 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full font-semibold text-sm shadow-lg transition-all duration-300 z-50';
    
    // Type-specific styling
    let typeClass = '';
    switch (type) {
        case 'success':
            typeClass = 'bg-green-500 text-white';
            break;
        case 'error':
            typeClass = 'bg-red-500 text-white';
            break;
        case 'warning':
            typeClass = 'bg-yellow-500 text-white';
            break;
        default:
            typeClass = 'bg-blue-500 text-white';
    }
    
    // Apply classes and show
    toast.className = `${baseClasses} ${typeClass} opacity-100 translate-y-0`;
    
    // Hide after duration
    toast.hideTimer = setTimeout(() => {
        toast.className = `${baseClasses} ${typeClass} opacity-0 translate-y-2`;
    }, duration);
    
    console.log(`Notification: ${message} (${type})`);
}

// Utility function to get current theme
function getCurrentTheme() {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

// Utility function to check if user prefers reduced motion
function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Initialize keyboard shortcuts
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Shift + D to toggle dark mode
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            document.getElementById('theme-toggle')?.click();
        }
        
        // Ctrl/Cmd + 1-7 for tab switching
        if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '7') {
            e.preventDefault();
            const tabNames = Object.keys(tabs);
            const tabIndex = parseInt(e.key) - 1;
            if (tabNames[tabIndex]) {
                showMainTab(tabNames[tabIndex]);
            }
        }
    });
}

// Initialize animations based on user preference
function initAnimations() {
    if (prefersReducedMotion()) {
        document.documentElement.style.setProperty('--animation-duration', '0ms');
    }
}

// Main initialization function
document.addEventListener('DOMContentLoaded', () => {
    console.log('VeoStart application initializing...');
    
    // Initialize dark mode first
    initDarkMode();
    
    // Initialize animations
    initAnimations();
    
    // Initialize keyboard shortcuts
    initKeyboardShortcuts();

    // Tab navigation
    Object.keys(tabs).forEach(tabKey => {
        const tabEl = document.getElementById(`${tabKey}-main-tab`);
        if (tabEl) {
            tabEl.addEventListener('click', () => showMainTab(tabKey));
        }
    });

    // Authentication Logic initialization
    const authMethodSelect = document.getElementById('auth-method-select');
    const apiKeySection = document.getElementById('api-key-auth-section');
    const accessTokenSection = document.getElementById('access-token-auth-section');
    const validateTokenBtn = document.getElementById('validate-token-btn');

    if (authMethodSelect) {
        authMethodSelect.addEventListener('change', (e) => {
            const method = e.target.value;
            if (method === 'api-key') {
                apiKeySection.classList.remove('hidden');
                accessTokenSection.classList.add('hidden');
            } else {
                apiKeySection.classList.add('hidden');
                accessTokenSection.classList.remove('hidden');
            }
            
            // Update status
            const statusEl = document.getElementById('access-token-status');
            if (statusEl) {
                statusEl.textContent = method === 'api-key' ? 'Using API Key' : 'Using Access Token';
                statusEl.className = 'text-xs text-gray-500 truncate max-w-[150px] md:max-w-xs';
            }
        });
    }

    if (validateTokenBtn) {
        validateTokenBtn.addEventListener('click', validateAccessToken);
    }

    // Auth Collapsible
    const authHeader = document.getElementById('auth-header');
    const authContent = document.getElementById('auth-content');
    const authChevron = document.getElementById('auth-chevron');

    if (authHeader && authContent && authChevron) {
        authHeader.addEventListener('click', () => {
            const isHidden = authContent.classList.toggle('hidden');
            authChevron.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
        });
        
        // Start collapsed on small screens, expanded on large
        if (window.innerWidth < 768) {
            authContent.classList.add('hidden');
            authChevron.style.transform = 'rotate(-90deg)';
        }
    }
    
    // Show default tab
    showMainTab('generator');
    
    // Welcome notification
    setTimeout(() => {
        const currentTheme = getCurrentTheme();
        showNotification(`Welcome to V-Start! Currently in ${currentTheme} mode. Press Ctrl+Shift+D to toggle theme.`, 'info', 5000);
    }, 1000);
    
    console.log('VeoStart application initialized successfully');
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Refresh theme when page becomes visible again
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            const html = document.documentElement;
            if (savedTheme === 'dark' && !html.classList.contains('dark')) {
                html.classList.add('dark');
            } else if (savedTheme === 'light' && html.classList.contains('dark')) {
                html.classList.remove('dark');
            }
        }
    }
});

// Export functions for use in other modules
export { showNotification, getCurrentTheme, showMainTab };