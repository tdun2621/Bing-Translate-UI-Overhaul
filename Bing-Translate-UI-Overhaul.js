// ==UserScript==
// @name         Bing Translate UI Overhaul
// @author       tdun2621
// @description  Enables Alt + Z to copy translated text (plain text), Alt + S to swap languages, Alt + A to swap tone. Defaults to English and French (Canada). Various UI fixes, including improved handling of emails/websites and line breaks.
// @match        https://www.bing.com/translator*
// @icon         https://images.sftcdn.net/images/t_app-icon-s/p/fcf326e2-9524-11e6-9fb1-00163ec9f5fa/3499352888/bing-translator-windows-10-icon.png
// @grant        none
// @version      1.3
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Clicks a given DOM element if it exists.
     * @param {HTMLElement} element - The element to click.
     */
    function clickElement(element) {
        if (element) {
            element.click();
        }
    }

    /**
     * Copies plain text to the clipboard using navigator.clipboard API,
     * with a fallback for older browsers or restricted environments.
     * @param {string} text - The text to copy.
     */
    function copyPlainText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(err => {
                console.error('Failed to copy text using Clipboard API: ', err);
                fallbackCopyText(text);
            });
        } else {
            fallbackCopyText(text);
        }
    }

    /**
     * Fallback method to copy text to clipboard using a temporary textarea and execCommand.
     * @param {string} text - The text to copy.
     */
    function fallbackCopyText(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        // Position off-screen to avoid visual disruption
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            // Deprecated, but still works in many environments where Clipboard API is restricted
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
        } finally {
            document.body.removeChild(textArea);
        }
    }

    /**
     * Retrieves the translated text from the Bing Translate output div.
     * @returns {string|null} The translated text, or null if the element is not found.
     */
    function getTranslatedText() {
        const bingResult = document.querySelector('#tta_output_ta');
        if (bingResult) {
            return bingResult.innerText; // Use innerText for div elements
        }
        return null;
    }

    /**
     * Handles keyboard shortcuts for copying translated text and swapping languages,
     * and now also for toggling tone.
     * @param {KeyboardEvent} event - The keyboard event.
     */
    function handleKeydown(event) {
        // Alt + Z for copying translated text as plain text
        if (event.altKey && event.key === 'z') {
            event.preventDefault(); // Prevent default browser action
            const translatedText = getTranslatedText();
            if (translatedText) {
                copyPlainText(translatedText.trim());
            }
        }

        // Alt + S for swapping languages
        if (event.altKey && event.key === 's') {
            event.preventDefault(); // Prevent default browser action
            const bingSwapButton = document.querySelector('div#tta_revIcon');
            clickElement(bingSwapButton);
        }

        // Alt + A for toggling between Casual and Formal tones
        if (event.altKey && event.key === 'a') {
            event.preventDefault(); // Prevent default browser action

            const toneSelectElement = document.querySelector('#tta_tonesl');
            if (toneSelectElement) {
                const currentTone = toneSelectElement.value;
                if (currentTone === 'Casual') {
                    selectTone('Formal');
                } else if (currentTone === 'Formal') {
                    selectTone('Casual');
                } else { // If it's "Standard" or anything else, default to Casual
                    selectTone('Casual');
                }
            } else {
                console.warn('Tone select element (#tta_tonesl) not found.');
            }
        }
    }

    /**
     * Attempts to preserve line breaks in the Bing Translator output by
     * synchronizing with the input's line structure using anchors.
     */
    function preserveBingLineBreaks() {
        if (!window.location.hostname.includes('bing.com')) return;

        let lastProcessedInputHTML = '';
        let lastProcessedOutputText = '';

        // --- Helper functions for anchor-based splitting ---
        const urlRegexSimple = /^(https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/;
        const emailRegexSimple = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        function isSpecial(line) {
            const trimmed = line.trim();
            // Basic check for things that shouldn't be translated or split strangely
            return urlRegexSimple.test(trimmed) || emailRegexSimple.test(trimmed);
        }

        function escapeRegex(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
        }
        // --- End Helpers ---

        /**
         * Dispatches various DOM events on an element to simulate user input.
         * @param {HTMLElement} element - The element to dispatch events on.
         */
        function triggerOutputEvents(element) {
            const inputEvent = new Event('input', { bubbles: true });
            const changeEvent = new Event('change', { bubbles: true });
            const compositionEndEvent = new Event('compositionend', { bubbles: true });
            element.dispatchEvent(inputEvent);
            element.dispatchEvent(changeEvent);
            element.dispatchEvent(compositionEndEvent);
        }

        /**
         * Core logic for processing and restoring line breaks.
         */
        function processTranslationLineBreaks() {
            const inputTextarea = document.querySelector('#tta_input_ta');
            const outputDiv = document.querySelector('#tta_output_ta');

            if (!inputTextarea || !outputDiv) {
                setTimeout(processTranslationLineBreaks, 500);
                return;
            }

            const currentInputHTML = inputTextarea.innerHTML;
            const currentOutputText = outputDiv.innerText;

            if (currentInputHTML === lastProcessedInputHTML && currentOutputText === lastProcessedOutputText) {
                return;
            }

            lastProcessedInputHTML = currentInputHTML;
            lastProcessedOutputText = currentOutputText;

            const inputLines = inputTextarea.innerHTML
                .replace(/<br\s*\/?>/gi, '\n')
                .split('\n');

            if (inputLines.every(line => line.trim() === '')) {
                if (outputDiv.innerText !== '') {
                    outputDiv.innerText = '';
                    triggerOutputEvents(outputDiv);
                }
                return;
            }

            const specialInputLines = inputLines
                .map(line => line.trim())
                .filter(isSpecial);

            let outputSegments = [];
            const trimmedOutputText = currentOutputText.trim();

            if (specialInputLines.length > 0 && trimmedOutputText.length > 0) {
                const splitters = specialInputLines.map(escapeRegex);
                const regex = new RegExp(`(${splitters.join('|')})`, 'g');
                // Split the output text by the special lines.
                // The map(s => s.trim()) and filter(s => s.length > 0) are crucial.
                outputSegments = currentOutputText.split(regex).map(s => s.trim()).filter(s => s.length > 0);
            } else if (trimmedOutputText.length > 0) {
                 // Fallback: Try sentence splitting if no special lines or they don't match.
                 // This regex splits by common sentence terminators (. ! ?).
                outputSegments = currentOutputText.match(/[^.!?]+(?:[.!?]+|$)/g) || [currentOutputText];
                outputSegments = outputSegments.map(s => s.trim()).filter(s => s.length > 0);
            }

            // If still empty/failed (e.g. output is only special lines that got consumed by split, or only whitespace),
            // use the whole trimmed block if it's not empty.
            if(outputSegments.length === 0 && trimmedOutputText.length > 0) {
                outputSegments = [trimmedOutputText];
            }


            let restoredOutputArray = [];
            let outputIndex = 0;

            // Correlate input lines with output segments
            for (let i = 0; i < inputLines.length; i++) {
                const inputLineTrimmed = inputLines[i].trim();

                if (inputLineTrimmed === '') {
                    restoredOutputArray.push(''); // Preserve empty input lines
                } else {
                    // If there's a corresponding output segment, use it
                    if (outputIndex < outputSegments.length) {
                        restoredOutputArray.push(outputSegments[outputIndex]);
                        outputIndex++;
                    } else {
                        // If output is shorter than input (e.g., Bing translated multiple input lines into one)
                        // or if alignment is lost. Push empty string to maintain line count.
                        console.warn("Input/Output alignment mismatch (fewer output segments than input lines). Pushing empty for input line:", inputLineTrimmed);
                        restoredOutputArray.push('');
                    }
                }
            }

            // If there are more output segments than input lines (e.g., Bing split one input line into multiple sentences)
            // append the remaining output segments to the last non-empty line of the restored output.
            while (outputIndex < outputSegments.length) {
                console.warn("Appending extra output segment to the last non-empty line:", outputSegments[outputIndex]);
                let foundSpot = false;
                for(let k = restoredOutputArray.length - 1; k >= 0; k--) {
                    if(restoredOutputArray[k] !== '') {
                        // THIS IS THE LINE OF CONCERN for adding superfluous spaces into URLs/emails
                        // If outputSegments[outputIndex-1] (which became restoredOutputArray[k])
                        // and outputSegments[outputIndex] are parts of a URL/email,
                        // the ' ' + might be incorrect.
                        // Example: restoredOutputArray[k] = "example."
                        // outputSegments[outputIndex] = "com"
                        // Result: "example. com"
                        // A more sophisticated joining logic might be needed here if this is the root cause.
                        // However, the splitting logic (isSpecial, sentence splitting) should ideally
                        // prevent URLs/emails from being broken into such `outputSegments`.
                        // If Bing itself introduces spaces (e.g. "example. com"), the script currently preserves that.
                        restoredOutputArray[k] += ' ' + outputSegments[outputIndex];
                        foundSpot = true;
                        break;
                    }
                }
                // If all previous lines were empty, just push the segment as a new line.
                if(!foundSpot) {
                    restoredOutputArray.push(outputSegments[outputIndex]);
                }
                outputIndex++;
            }

            const restoredOutput = restoredOutputArray.join('\n');

            if (outputDiv.innerText !== restoredOutput) {
                outputDiv.innerText = restoredOutput;
                triggerOutputEvents(outputDiv); // Notify Bing of the change
            }
        }


        // --- Monitoring setup ---
        // Observe changes in both input and output areas to reprocess line breaks.
        const config = { childList: true, subtree: true, characterData: true, attributes: true }; // Observe everything

        const inputTextarea = document.querySelector('#tta_input_ta');
        if (inputTextarea) {
            new MutationObserver(processTranslationLineBreaks).observe(inputTextarea, { childList: true, characterData: true, subtree: true });
            // Also trigger on direct input events for faster response.
            inputTextarea.addEventListener('input', () => setTimeout(processTranslationLineBreaks, 50)); // Debounce slightly
        }

        const outputDiv = document.querySelector('#tta_output_ta');
        if (outputDiv) {
            // Observe the output div for changes (e.g., when Bing updates translation)
            new MutationObserver(processTranslationLineBreaks).observe(outputDiv, config);
        }

        // Fallback: Periodically check, in case mutation observers miss something or are too slow.
        setInterval(processTranslationLineBreaks, 750);
    }

    /**
     * Overrides Bing's default copy button behavior to copy plain text only.
     */
    function overrideBingCopyButton() {
        if (!window.location.hostname.includes('bing.com')) return;

        function findAndOverrideCopyButton() {
            const copyButton = document.querySelector('div#tta_copyIcon');
            if (copyButton && !copyButton.hasAttribute('data-plain-text-override')) {
                copyButton.setAttribute('data-plain-text-override', 'true'); // Mark as overridden
                // Clone and replace to remove existing event listeners
                const newCopyButton = copyButton.cloneNode(true);
                copyButton.parentNode.replaceChild(newCopyButton, copyButton);

                newCopyButton.addEventListener('click', function(event) {
                    event.preventDefault(); // Stop Bing's original copy action
                    event.stopPropagation(); // Stop event from bubbling further

                    const outputTextarea = document.querySelector('#tta_output_ta'); // Bing's output area
                    if (outputTextarea && outputTextarea.innerText) {
                        copyPlainText(outputTextarea.innerText.trim()); // Copy plain text

                        // Visual feedback
                        const originalTitle = newCopyButton.title;
                        newCopyButton.title = 'Copied!';
                        newCopyButton.style.opacity = '0.6'; // Dim to indicate action

                        setTimeout(() => { // Reset after a short delay
                            newCopyButton.title = originalTitle;
                            newCopyButton.style.opacity = '';
                        }, 1000);
                    }
                });
            }
        }

        // Try to find the button at different stages of page load
        findAndOverrideCopyButton();
        setTimeout(findAndOverrideCopyButton, 1000); // After 1 sec
        setTimeout(findAndOverrideCopyButton, 3000); // After 3 sec

        // Observe for dynamic changes (e.g., if Bing re-renders the button)
        const observer = new MutationObserver(() => {
            findAndOverrideCopyButton();
        });
        observer.observe(document.body, {
            childList: true, // Watch for direct children changes in body
            subtree: true   // Watch for changes in all descendants of body
        });
    }

    /**
     * Sets the default source and target languages for Bing Translate.
     */
    function setDefaultLanguages() {
        if (!window.location.hostname.includes('bing.com')) return;

        function selectLanguage(dropdownSelector, languageText) {
            const dropdownButton = document.querySelector(dropdownSelector);
            if (dropdownButton) {
                // Only change if not already selected
                if (dropdownButton.textContent.trim() === languageText) {
                    return;
                }
                clickElement(dropdownButton); // Open dropdown

                // Observe for the language list to appear
                const languageListObserver = new MutationObserver((mutations, observer) => {
                    const languageOption = Array.from(document.querySelectorAll('.tta_menu_item'))
                        .find(item => item.textContent.trim() === languageText);
                    if (languageOption) {
                        clickElement(languageOption); // Select the language
                        observer.disconnect(); // Stop observing

                        // Ensure the dropdown closes (sometimes it stays open)
                        setTimeout(() => {
                            if (dropdownButton.getAttribute('aria-expanded') === 'true') {
                                clickElement(dropdownButton); // Click to close if still open
                            }
                        }, 100);
                    }
                });
                languageListObserver.observe(document.body, { childList: true, subtree: true });
            }
        }

        // Set default languages
        selectLanguage('#tta_srcsl', 'English (detected)'); // Source: English (auto-detected)
        selectLanguage('#tta_tgtlang', 'French (Canada)');   // Target: French (Canada)
    }

    /**
     * Selects a specific tone from the Bing Translate tone dropdown.
     * @param {string} toneText - The exact text of the tone option to select.
     */
    function selectTone(toneText) {
        if (!window.location.hostname.includes('bing.com')) return;
        const toneSelectElement = document.querySelector('#tta_tonesl');
        if (!toneSelectElement) {
            console.warn('Tone select element (#tta_tonesl) not found. Cannot set tone.');
            return;
        }
        // Only change if not already selected
        if (toneSelectElement.value === toneText) {
            return;
        }
        toneSelectElement.value = toneText;
        // Dispatch a change event to ensure Bing recognizes the new value
        const changeEvent = new Event('change', { bubbles: true });
        toneSelectElement.dispatchEvent(changeEvent);
        console.log(`Tone set to: ${toneText}`);
    }


    /**
     * Applies custom CSS styles to the Bing Translate page.
     */
    function applyCustomStyles() {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = `
            /* Hide header, nav links, and footer for a cleaner interface */
            #theader, .t_navlinkitem, #b_footerItems {
                display: none !important;
            }
            /* Ensure full width and height usage */
            html, body {
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: auto !important; /* Allow scrolling if content overflows */
            }
            /* Make all containers and translation areas take full width */
            #app, #b_content, .main, .b_frame, .b_container, .b_translatorContainer, .b_translator,
            #tt_translatorHome, #tt_txtContrl, #rich_tta, table.tta_tbl {
                width: 100% !important;
                max-width: none !important; /* Override any max-width restrictions */
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box; /* Include padding and border in the element's total width and height */
            }
            /* Ensure table layout is fixed and cells are equally distributed */
            table.tta_tbl {
                table-layout: fixed !important;
                border-collapse: collapse !important;
            }
            tr.tta_tableRow, table.tta_tbl > tbody > tr {
                width: 100% !important;
                display: table-row !important; /* Ensure proper table row behavior */
            }
            /* Input and output cells should each take 50% width */
            td.tta_incell, td.tta_outcell {
                width: 50% !important;
                padding: 5px !important; /* Add some padding inside cells */
                box-sizing: border-box;
                vertical-align: top !important; /* Align content to the top */
                min-width: unset !important; /* Remove any min-width that might shrink cells */
            }
            /* Flexbox for input/output containers to manage height */
            #tta_in, #tta_out {
                display: flex !important;
                flex-direction: column !important;
                width: 100% !important;
                min-height: 65vh !important; /* Ensure a minimum height */
                height: auto !important; /* Allow height to grow with content */
                align-items: stretch !important; /* Stretch children to fill width */
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box;
            }
            /* Style for the actual text areas (input and output) */
            #tta_input_ta, #tta_output_ta {
                font-size: 24px !important; /* Larger font size for readability */
                min-height: 60vh !important; /* Minimum height for text areas */
                height: auto !important; /* Grow with content */
                width: 100% !important; /* Full width */
                box-sizing: border-box !important;
                padding: 15px !important; /* Generous padding */
                resize: vertical !important; /* Allow vertical resizing by user */
                overflow-y: auto !important; /* Add scrollbar if content overflows */
                white-space: pre-wrap !important; /* Preserve line breaks and spaces */
                word-wrap: break-word !important; /* Break long words to prevent horizontal scroll */
                min-width: unset !important;
            }
            /* Ensure the parent boxes of textareas also flex correctly */
            .tta_inputbox, .tta_outputbox {
                flex: 1; /* Allow them to grow and shrink */
                display: flex;
                flex-direction: column;
                min-width: unset !important;
            }
            /* Adjust swap button cell width and alignment */
            td.tta_swapcell {
                width: auto !important; /* Don't force 50% width */
                padding: 5px !important;
                vertical-align: middle !important; /* Center swap button vertically */
            }
        `;
        document.head.appendChild(style);
    }

    // Initialize functions after the page has loaded.
    function initialize() {
        applyCustomStyles();
        preserveBingLineBreaks(); // This function contains the logic in question
        overrideBingCopyButton();
        setDefaultLanguages();
        selectTone('Casual'); // Default tone
        document.addEventListener('keydown', handleKeydown, false);
    }

    // Wait for the DOM to be fully loaded before initializing
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // DOMContentLoaded has already fired
        initialize();
    }

})();
