// Helper function to show status messages
function showStatus(message, isError = false) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.style.display = 'block';
    status.className = isError ? 'error' : 'success';
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  }
  
  // Helper function to log removal information
  function showRemovalLog(removedItems) {
    const log = document.getElementById('removal-log');
    if (removedItems.length > 0) {
      log.innerHTML = '<strong>Removed sections:</strong><br>' + 
        removedItems.map(item => `- ${item}`).join('<br>');
      log.style.display = 'block';
    } else {
      log.style.display = 'none';
    }
  }
  
  // [Previous helper functions stay exactly the same]

  document.addEventListener('DOMContentLoaded', () => {
    const generateButton = document.getElementById('generate-toc');
    const removeBlanksButton = document.getElementById('remove-blanks');
  
    if (generateButton) {
      generateButton.addEventListener('click', async () => {
        try {
          const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
          const results = await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: generateTOC,
            args: [tab.url]
          });
          
          const result = results?.[0]?.result;
          if (result?.success) {
            showStatus('TOC successfully updated');
          } else {
            showStatus(result?.error || 'Error generating TOC', true);
          }
        } catch (error) {
          showStatus('Error: ' + error.message, true);
        }
      });
    }
  
    if (removeBlanksButton) {
      removeBlanksButton.addEventListener('click', async () => {
        try {
          const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
          
          // First remove blank sections
          console.log("Executing removeBlanks");
          const results = await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: removeBlanks
          });
          
          console.log("Got results:", results);
          const removedSections = results?.[0]?.result?.removedSections;
          console.log("Removed sections from results:", removedSections);
          
          if (removedSections && removedSections.length > 0) {
            // If sections were removed, generate new TOC
            await chrome.scripting.executeScript({
              target: {tabId: tab.id},
              func: generateTOC,
              args: [tab.url]
            });
            
            showStatus(`Removed ${removedSections.length} blank sections`);
            showRemovalLog(removedSections);
          } else {
            showStatus('No blank sections found');
          }
        } catch (error) {
          console.log("Error in click handler:", error);
          showStatus('Error removing blank sections: ' + error.message, true);
        }
      });
    }
  });
  
  function generateTOC(postUrl) {
    try {
      console.log("Starting TOC generation");
      
      // Find headers first
      const headers = document.querySelectorAll('h1, h2, h3, h4');
      let headersArray = Array.from(headers)
        .filter(header => header.textContent.trim() !== "");
      
      const cutoffTitles = ["Preview post", "Post info", "Post settings", "Publish", "Heads up!"];
      const cutoffIndex = headersArray.findIndex(header => 
        cutoffTitles.includes(header.textContent.trim())
      );
      if (cutoffIndex !== -1) {
        headersArray = headersArray.slice(0, cutoffIndex);
      }
      
      if (headersArray.length === 0) {
        return { success: false, error: "No headers found to generate TOC" };
      }
      
      // Create new TOC
      const tocContainerId = 'generated-toc';
      const labelAsBlank = ' (Blank)';
      
      let tocContainer = document.createElement('div');
      tocContainer.id = tocContainerId;
      tocContainer.style.border = '1px solid #ccc';
      tocContainer.style.padding = '10px';
      tocContainer.style.marginBottom = '20px';
      
      // Add title
      let tocTitle = document.createElement('h4');
      tocTitle.textContent = 'Table of Contents';
      tocContainer.appendChild(tocTitle);
      
      // Create TOC list
      let tocList = document.createElement('ol');
      headersArray.forEach((header, index) => {
        let id = header.id || `section-${index}`;
        header.id = id;
        
        let isEmpty = true;
        let nextSibling = header.nextElementSibling;
        while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
          if (nextSibling.textContent.trim() !== "") {
            isEmpty = false;
            break;
          }
          nextSibling = nextSibling.nextElementSibling;
        }
        
        let tocItem = document.createElement('li');
        let tocLink = document.createElement('a');
        tocLink.textContent = header.textContent.trim() + 
                           (header.textContent.trim().endsWith('.') ? '' : '.') +
                           (isEmpty ? labelAsBlank : '');
        
        const urlMatch = postUrl.match(/^(https:\/\/[^\/]+)\/publish\/post\/(\d+)/);
        if (urlMatch) {
          let slug = header.textContent.trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
          tocLink.href = `${urlMatch[1]}/i/${urlMatch[2]}/${slug}`;
        } else {
          tocLink.href = `#${id}`;
        }
        
        tocItem.appendChild(tocLink);
        tocList.appendChild(tocItem);
      });
      
      tocContainer.appendChild(tocList);
      
      // Insert the new TOC
      console.log("Inserting new TOC");
      const firstHeader = headersArray[0];
      if (firstHeader && firstHeader.parentNode) {
        firstHeader.parentNode.insertBefore(tocContainer, firstHeader);
      } else {
        const editor = document.querySelector('div[role="article"]') || 
                      document.querySelector('[contenteditable="true"]') || 
                      document.querySelector('div[role="main"]');
        if (editor) {
          editor.prepend(tocContainer);
        } else {
          return { success: false, error: "Could not find location to insert TOC" };
        }
      }
      
      console.log("TOC generation complete");
      return { success: true };
      
    } catch (e) {
      console.error("Critical error in generateTOC:", e);
      return { success: false, error: e.message };
    }
  }
  
  async function removeBlanks() {
    try {
      console.log("Starting removeBlanks");
      const removedSections = [];
      const headers = document.querySelectorAll('h1, h2, h3, h4');
      console.log("Found headers:", headers.length);
      
      // Filter out unwanted headers including interface elements
      const interfaceTitles = [
        "Preview post", "Post info", "Post settings", "Publish", "Heads up!",
        "Search images", "Generate image", "Secret draft link", "Send test email",
        "Heads up!", "Preview post"
      ];
      
      let headersArray = Array.from(headers)
        .filter(header => header.textContent.trim() !== "" && 
                !interfaceTitles.includes(header.textContent.trim()));
                
      console.log("Filtered headers:", headersArray.length);
  
      headersArray.forEach(header => {
        console.log("Checking header:", header.textContent);
        let isEmpty = true;
        let nextSibling = header.nextElementSibling;
        while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
          if (nextSibling.textContent.trim() !== "") {
            isEmpty = false;
            break;
          }
          nextSibling = nextSibling.nextElementSibling;
        }
  
        if (isEmpty) {
          console.log("Found empty section:", header.textContent);
          removedSections.push(header.textContent.trim());
          header.remove();
          nextSibling = header.nextElementSibling;
          while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
            let toRemove = nextSibling;
            nextSibling = nextSibling.nextElementSibling;
            toRemove.remove();
          }
        }
      });
  
      console.log("Removed sections:", removedSections);
      console.log("Removed sections length:", removedSections.length);
      
      return { removedSections };
    } catch (e) {
      console.error("Error in removeBlanks:", e);
      return { removedSections: [] };
    }
  }

  