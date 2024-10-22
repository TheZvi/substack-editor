document.addEventListener('DOMContentLoaded', () => {
    const generateButton = document.getElementById('generate-toc');
    if (generateButton) {
      generateButton.addEventListener('click', () => {
        // Inject the generateTOC function
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs.length > 0) {
            // Pass the URL of the current tab to the content script
            chrome.scripting.executeScript({
              target: {tabId: tabs[0].id},
              func: generateTOC,
              args: [tabs[0].url]
            });
          }
        });
      });
    }
  
    const removeBlanksButton = document.getElementById('remove-blanks');
    if (removeBlanksButton) {
      removeBlanksButton.addEventListener('click', () => {
        // Inject the removeBlanks function
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs.length > 0) {
            chrome.scripting.executeScript({
              target: {tabId: tabs[0].id},
              func: removeBlanks
            });
          }
        });
      });
    }
  });
  
  function generateTOC(postUrl) {
    console.log("Running generateTOC() in the page context");
    const tocContainerId = 'generated-toc';
  
    // Define what to label blank sections
    const labelAsBlank = ' (Blank)';

    // Remember current scroll position
    const scrollPosition = window.scrollY;
  
    // Remove existing TOC if present
    let existingToc = document.getElementById(tocContainerId);
    if (existingToc) {
      existingToc.remove();
    }
  
    // Create TOC container
    let tocContainer = document.createElement('div');
    tocContainer.id = tocContainerId;
    tocContainer.style.border = '1px solid #ccc';
    tocContainer.style.padding = '10px';
    tocContainer.style.marginBottom = '20px';
  
    // Extract the base URL and post ID from the postUrl
    const urlMatch = postUrl.match(/^(https:\/\/[^\/]+)\/publish\/post\/(\d+)/);
    let baseUrl, postId;
    if (urlMatch) {
      baseUrl = urlMatch[1];
      postId = urlMatch[2];
    }
  
    // Find section headers in the entire document (h1, h2, h3, h4)
    const headers = document.querySelectorAll('h1, h2, h3, h4');
  
    if (headers.length === 0) {
      return;
    }
  
    // Convert headers NodeList to an array and filter out unwanted items
    let headersArray = Array.from(headers).filter(header => header.textContent.trim() !== "");
    const cutoffTitles = ["Preview post", "Post info", "Post settings", "Publish", "Heads up!"];
    const cutoffIndex = headersArray.findIndex(header => cutoffTitles.includes(header.textContent.trim()));
    if (cutoffIndex !== -1) {
      headersArray = headersArray.slice(0, cutoffIndex);
    }
  
    // Create TOC title
    let tocTitle = document.createElement('h4');
    tocTitle.textContent = 'Table of Contents';
    tocContainer.appendChild(tocTitle);
  
    // Create TOC ordered list
    let tocList = document.createElement('ol');
    headersArray.forEach((header, index) => {
      let id = header.id || `section-${index}`;
      header.id = id;
  
      // Check if the section is empty (no non-header text between headers)
      let isEmpty = true;
      let nextSibling = header.nextElementSibling;
      while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
        if (nextSibling.textContent.trim() !== "") {
          isEmpty = false;
          break;
        }
        nextSibling = nextSibling.nextElementSibling;
      }
  
      const labelAsBlank = ' (Blank)';
      let tocItem = document.createElement('li');
      let tocLink = document.createElement('a');
      tocLink.textContent = header.textContent + (isEmpty ? labelAsBlank + '.' : '.');
  
      // If we have a valid baseUrl and postId, create a full URL, otherwise just use the header text
      if (baseUrl && postId) {
        let slug = header.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        let sectionUrl = `${baseUrl}/i/${postId}/${slug}`;
        tocLink.href = sectionUrl;
      } else {
        tocLink.href = `#${id}`; // Fallback to in-page link
      }
  
      tocItem.appendChild(tocLink);
      tocList.appendChild(tocItem);
    });
  
    tocContainer.appendChild(tocList);
  
    // Insert TOC before the first header
    const firstHeader = headersArray[0];
    if (firstHeader) {
      console.log("Inserting TOC before the first section header");
      firstHeader.parentNode.insertBefore(tocContainer, firstHeader);
    } else {
      const editor = document.querySelector('div[role="article"]') || document.querySelector('[contenteditable="true"]') || document.querySelector('div[role="main"]');
      if (editor) {
        editor.prepend(tocContainer);
      }
    }
  
    // Restore scroll position
    window.scrollTo(0, scrollPosition);
  }
  
  function removeBlanks() {
    const labelAsBlank = ' (Blank)';
    const tocContainerId = 'generated-toc';
    let headers = document.querySelectorAll('h1, h2, h3, h4');
    let headersArray = Array.from(headers).filter(header => header.textContent.trim() !== "");
  
    headersArray.forEach(header => {
      // Check if the section is empty (no non-header text between headers)
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
        console.log(`Removing empty section: ${header.textContent}`);
        header.remove();
        nextSibling = header.nextElementSibling;
        while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
          let toRemove = nextSibling;
          nextSibling = nextSibling.nextElementSibling;
          toRemove.remove();
        }
      }
    });
  
    // Remove TOC entries that contain ' (Blank)'
    let tocContainer = document.getElementById(tocContainerId);
    if (tocContainer) {
      let tocListItems = tocContainer.querySelectorAll('li');
      tocListItems.forEach(item => {
        if (item.textContent.includes(labelAsBlank)) {
          console.log(`Removing TOC entry for blank section: ${item.textContent}`);
          item.remove();
        }
      });
    }
  }
  