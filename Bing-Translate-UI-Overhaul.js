// ==UserScript==
// @name          Bing Translate UI Overhaul
// @author        tdun2621
// @description   Enables Alt + Z to copy translated text (plain text), Alt + S to swap languages, Alt + A to swap tone. Defaults to English and French (Canada). Various UI fixes.
// @match         https://www.bing.com/translator*
// @icon          https://images.sftcdn.net/images/t_app-icon-s/p/fcf326e2-9524-11e6-9fb1-00163ec9f5fa/3499352888/bing-translator-windows-10-icon.png
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
     * synchronizing with the input's line structure.
     * This function is heuristic-based and tries to maintain a visual
     * correspondence between input and output line breaks.
     */
    function preserveBingLineBreaks() {
        if (!window.location.hostname.includes('bing.com')) return;

        let lastProcessedInputHTML = '';
        let lastProcessedOutputText = '';

        /**
         * Core logic for processing and restoring line breaks.
         * Called periodically and on relevant DOM mutations/events.
         */
        function processTranslationLineBreaks() {
            const inputTextarea = document.querySelector('#tta_input_ta');
            const outputDiv = document.querySelector('#tta_output_ta');

            if (!inputTextarea || !outputDiv) {
                // If elements are not yet available, retry after a short delay.
                setTimeout(processTranslationLineBreaks, 500);
                return;
            }

            const currentInputHTML = inputTextarea.innerHTML;
            const currentOutputText = outputDiv.innerText;

            // Only process if content has actually changed to avoid unnecessary work.
            if (currentInputHTML === lastProcessedInputHTML && currentOutputText === lastProcessedOutputText) {
                return;
            }

            lastProcessedInputHTML = currentInputHTML;
            lastProcessedOutputText = currentOutputText;

            // Normalize input lines: replace <br> with newlines, keep ALL lines (even empty ones).
            // This ensures that empty lines in the input (which represent double line breaks)
            // are accurately reflected.
            const inputLines = inputTextarea.innerHTML
                                    .replace(/<br\s*\/?>/gi, '\n') // Replace <br> with newlines
                                    .split('\n'); // Split by newline, preserving empty strings for empty lines

            // If input is entirely empty or just whitespace, clear the output.
            if (inputLines.every(line => line.trim() === '')) {
                if (outputDiv.innerText !== '') {
                    outputDiv.innerText = '';
                    triggerOutputEvents(outputDiv); // Trigger events to notify Bing of the change
                }
                return;
            }

            // Get translated sentences from the current output. This is a basic sentence tokenizer.
            const outputSentences = currentOutputText.match(/[^.!?]+(?:[.!?]+|$)/g) || [currentOutputText];
            // Clean and filter out empty sentences.
            const cleanedOutputSentences = outputSentences.map(s => s.trim()).filter(s => s.length > 0);

            let restoredOutput = '';
            let currentOutputSentenceIndex = 0;

            // Iterate through input lines to reconstruct the output with preserved line breaks.
            for (let i = 0; i < inputLines.length; i++) {
                const inputLineContent = inputLines[i].trim();

                // If the input line is empty, add appropriate newlines to the output.
                if (inputLineContent === '') {
                    // Add a double newline for visual separation, but prevent excessive newlines.
                    if (restoredOutput.length > 0 && !restoredOutput.endsWith('\n\n')) {
                        restoredOutput += '\n\n';
                    } else if (restoredOutput.length === 0 && i > 0) {
                        // Handle leading empty lines if the very first input line is empty.
                        restoredOutput += '\n';
                    }
                    continue; // Move to the next input line without consuming an output sentence.
                }

                // Try to find the corresponding output segment. This is the most challenging part,
                // as Bing might combine or split sentences differently.
                let segment = '';
                if (currentOutputSentenceIndex < cleanedOutputSentences.length) {
                    segment = cleanedOutputSentences[currentOutputSentenceIndex];
                    currentOutputSentenceIndex++;

                    // Special handling for the last input line: grab any remaining output sentences
                    // if Bing has concatenated them into one large string.
                    if (i === inputLines.length - 1) {
                         while (currentOutputSentenceIndex < cleanedOutputSentences.length) {
                            segment += ' ' + cleanedOutputSentences[currentOutputSentenceIndex];
                            currentOutputSentenceIndex++;
                        }
                    }
                }

                restoredOutput += segment.trim();

                // Add a single newline after non-empty lines, unless it's the very last line
                // or the next input line is an empty line (which will add a double newline).
                if (i < inputLines.length - 1 && inputLines[i+1].trim() !== '') {
                    restoredOutput += '\n';
                } else if (i < inputLines.length - 1 && inputLines[i+1].trim() === '' && restoredOutput.length > 0 && !restoredOutput.endsWith('\n\n')) {
                    restoredOutput += '\n';
                }
            }

            // Update the output div only if the content has changed to prevent infinite loops.
            if (outputDiv.innerText !== restoredOutput) {
                outputDiv.innerText = restoredOutput;
                triggerOutputEvents(outputDiv); // Trigger events to notify Bing of the programmatic change.
            }
        }

        /**
         * Dispatches various DOM events on an element to simulate user input,
         * which can trigger Bing's internal mechanisms to re-evaluate the output.
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

        // --- Monitoring setup ---
        // Observe mutations on the input and output areas to trigger line break processing.
        const config = { childList: true, subtree: true, characterData: true, attributes: true };

        const inputTextarea = document.querySelector('#tta_input_ta');
        if (inputTextarea) {
            // Observe changes to the input area's children (e.g., <br> tags being added/removed)
            new MutationObserver(processTranslationLineBreaks).observe(inputTextarea, { childList: true, characterData: true, subtree: true });
            // Listen for direct input events as well
            inputTextarea.addEventListener('input', () => setTimeout(processTranslationLineBreaks, 50));
        }

        const outputDiv = document.querySelector('#tta_output_ta');
        if (outputDiv) {
            // Observe changes to the output area
            new MutationObserver(processTranslationLineBreaks).observe(outputDiv, config);
        }

        // Set an interval to periodically check and process line breaks,
        // as some changes might not be caught by MutationObservers.
        setInterval(processTranslationLineBreaks, 750);
    }

    /**
     * Overrides Bing's default copy button behavior to copy plain text only.
     * This ensures consistency with the Alt+Z hotkey.
     */
    function overrideBingCopyButton() {
        if (!window.location.hostname.includes('bing.com')) return;

        /**
         * Finds the Bing copy button and attaches a custom click handler.
         * This function is called multiple times to handle dynamic loading/re-rendering.
         */
        function findAndOverrideCopyButton() {
            const copyButton = document.querySelector('div#tta_copyIcon');
            // Check if the button exists and hasn't been overridden yet
            if (copyButton && !copyButton.hasAttribute('data-plain-text-override')) {
                // Mark the button as overridden to prevent re-attaching listeners
                copyButton.setAttribute('data-plain-text-override', 'true');

                // Clone the button to remove existing event listeners
                const newCopyButton = copyButton.cloneNode(true);
                copyButton.parentNode.replaceChild(newCopyButton, copyButton);

                // Add the custom click listener
                newCopyButton.addEventListener('click', function(event) {
                    event.preventDefault(); // Prevent Bing's default copy action
                    event.stopPropagation(); // Stop event propagation

                    const outputTextarea = document.querySelector('#tta_output_ta');
                    if (outputTextarea && outputTextarea.innerText) {
                        copyPlainText(outputTextarea.innerText.trim());

                        // Provide visual feedback to the user
                        const originalTitle = newCopyButton.title;
                        newCopyButton.title = 'Copied!';
                        newCopyButton.style.opacity = '0.6';

                        // Revert visual feedback after a short delay
                        setTimeout(() => {
                            newCopyButton.title = originalTitle;
                            newCopyButton.style.opacity = '';
                        }, 1000);
                    }
                });
            }
        }

        // Call immediately and with delays to catch the button as it loads
        findAndOverrideCopyButton();
        setTimeout(findAndOverrideCopyButton, 1000);
        setTimeout(findAndOverrideCopyButton, 3000);

        // Observe DOM changes to catch if the copy button is re-rendered later
        const observer = new MutationObserver(() => {
            findAndOverrideCopyButton();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Sets the default source and target languages for Bing Translate.
     */
    function setDefaultLanguages() {
        if (!window.location.hostname.includes('bing.com')) return;

        /**
         * Helper function to select a language from a dropdown.
         * @param {string} dropdownSelector - CSS selector for the dropdown button.
         * @param {string} languageText - The exact text of the language option to select.
         */
        function selectLanguage(dropdownSelector, languageText) {
            const dropdownButton = document.querySelector(dropdownSelector);
            if (dropdownButton) {
                // Check if the desired language is already selected to avoid unnecessary clicks
                if (dropdownButton.textContent.trim() === languageText) {
                    return;
                }

                // Click the dropdown to open the language list
                clickElement(dropdownButton);

                // Use a MutationObserver to wait for the language list to appear in the DOM.
                // The language list is often appended to the body or a high-level container.
                const languageListObserver = new MutationObserver((mutations, observer) => {
                    const languageOption = Array.from(document.querySelectorAll('.tta_menu_item'))
                                                     .find(item => item.textContent.trim() === languageText);
                    if (languageOption) {
                        clickElement(languageOption); // Click the desired language option
                        observer.disconnect(); // Stop observing once the option is found and clicked

                        // After selection, ensure the dropdown closes if it doesn't automatically.
                        setTimeout(() => {
                            if (dropdownButton.getAttribute('aria-expanded') === 'true') {
                                clickElement(dropdownButton); // Click again to close if still open
                            }
                        }, 100);
                    }
                });

                // Observe the body for the language list.
                languageListObserver.observe(document.body, { childList: true, subtree: true });
            }
        }

        // Apply default languages: English (detected) for source, French (Canada) for target.
        selectLanguage('#tta_srcsl', 'English (detected)');
        selectLanguage('#tta_tgtlang', 'French (Canada)');
    }

    /**
     * Selects a specific tone from the Bing Translate tone dropdown.
     * @param {string} toneText - The exact text of the tone option to select (e.g., 'Casual', 'Formal', 'Standard').
     */
    function selectTone(toneText) {
        if (!window.location.hostname.includes('bing.com')) return;

        const toneSelectElement = document.querySelector('#tta_tonesl');

        if (!toneSelectElement) {
            console.warn('Tone select element (#tta_tonesl) not found. Cannot set tone.');
            return;
        }

        // Check if the desired tone is already selected to avoid unnecessary actions
        if (toneSelectElement.value === toneText) {
            console.log(`Tone '${toneText}' is already selected.`);
            return;
        }

        // Set the value of the select element
        toneSelectElement.value = toneText;

        // Dispatch a change event to notify Bing's internal JavaScript of the selection change
        const changeEvent = new Event('change', { bubbles: true });
        toneSelectElement.dispatchEvent(changeEvent);

        console.log(`Tone set to: ${toneText}`);
    }


    /**
     * Applies custom CSS styles to the Bing Translate page to control
     * font size, textbox dimensions, and overall layout.
     */
    function applyCustomStyles() {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = `
            /* Hide the header */
            #theader {
                display: none !important;
            }

            /* Hide the header menu (assuming it's a ul within a nav or similar) */
            /* This targets the specific list items you provided */
            .t_navlinkitem {
                display: none !important;
            }

            /* Hide the footer */
            #b_footerItems {
                display: none !important;
            }

            /* Ensure html and body take full width and height without default margins/padding */
            html, body {
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: auto !important; /* Allow scrolling if content overflows */
            }

            /* Target common top-level Bing containers to ensure full width */
            #app, #b_content, .main, .b_frame, .b_container, .b_translatorContainer, .b_translator {
                width: 100% !important;
                max-width: none !important; /* Remove any max-width constraints */
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box;
            }

            /* Target the specific translator home div and its immediate children */
            #tt_translatorHome, #tt_txtContrl, #rich_tta {
                width: 100% !important;
                max-width: none !important;
                box-sizing: border-box;
                margin: 0 !important;
                padding: 0 !important;
            }

            /* Target the table and its rows/cells directly */
            table.tta_tbl {
                width: 100% !important;
                max-width: none !important;
                table-layout: fixed !important; /* Forces table columns to honor specified widths */
                border-collapse: collapse !important; /* Remove spacing between cells */
            }

            tr.tta_tableRow, table.tta_tbl > tbody > tr { /* Target the row specifically */
                width: 100% !important;
                display: table-row !important; /* Ensure it behaves as a table row */
            }

            td.tta_incell, td.tta_outcell {
                width: 50% !important; /* Each cell takes half the table width */
                padding: 5px !important; /* Add some padding around the cells */
                box-sizing: border-box;
                vertical-align: top !important; /* Align content to the top */
                min-width: unset !important; /* Ensure no min-width is preventing expansion */
            }

            /* Apply flexbox to the container holding input and output areas within the cells */
            /* This is actually the div #tta_in and #tta_out */
            #tta_in, #tta_out {
                display: flex !important;
                flex-direction: column !important; /* Stack children vertically */
                width: 100% !important; /* Take full width of their parent cell */
                min-height: 65vh !important; /* Ensure this container is tall */
                height: auto !important; /* Allow height to adjust */
                align-items: stretch !important; /* Make children fill height */
                margin: 0 !important; /* Remove margin here, use cell padding */
                padding: 0 !important;
                box-sizing: border-box;
            }

            /* Styles for the actual contenteditable text areas */
            #tta_input_ta, #tta_output_ta {
                font-size: 24px !important; /* Force font size */
                min-height: 60vh !important; /* Make text areas very tall, slightly less than parent */
                height: auto !important; /* Allow height to adjust if content is very long */
                width: 100% !important; /* Take 100% of their parent's width */
                box-sizing: border-box; /* Include padding and border in the element's total width and height */
                padding: 15px !important; /* Add more padding inside the text areas */
                resize: vertical !important; /* Allow vertical resizing, but not horizontal */
                overflow-y: auto !important; /* Enable scroll if content overflows */
                white-space: pre-wrap !important; /* Preserve whitespace and wrap text normally */
                word-wrap: break-word !important; /* Ensure long words break */
                min-width: unset !important; /* Ensure no min-width is preventing expansion */
            }

            /* Adjust the specific input/output box wrappers if needed */
            .tta_inputbox, .tta_outputbox {
                flex: 1; /* Ensure they fill the available space within their parent (#tta_input / #tta_out) */
                display: flex;
                flex-direction: column;
                min-width: unset !important; /* Ensure no min-width is preventing expansion */
            }

            /* Ensure the swap icon cell doesn't take up too much space */
            td.tta_swapcell {
                width: auto !important; /* Allow it to shrink to content size */
                padding: 5px !important;
                vertical-align: middle !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Initialize functions after the page has loaded.
    // Use DOMContentLoaded for earlier execution if possible, fallback to immediate execution.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            applyCustomStyles(); // Apply styles as early as possible
            preserveBingLineBreaks();
            overrideBingCopyButton();
            setDefaultLanguages();
            selectTone('Casual'); // Set default tone to Casual
        });
    } else {
        applyCustomStyles(); // Apply styles immediately if DOM is already loaded
        preserveBingLineBreaks();
        overrideBingCopyButton();
        setDefaultLanguages();
        selectTone('Casual'); // Set default tone to Casual
    }

    // Attach the global keydown listener for hotkeys.
    document.addEventListener('keydown', handleKeydown, false);
})();
