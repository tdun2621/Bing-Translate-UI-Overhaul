// ==UserScript==
// @name         Bing Translate UI Overhaul
// @author       tdun2621
// @description  Enables Alt + Z to copy translated text (plain text), Alt + S to swap languages, Alt + A to swap tone. Defaults to English and French (Canada). Various UI fixes, including improved handling of emails/websites and line breaks.
// @match        https://www.bing.com/translator*
// @icon         https://images.sftcdn.net/images/t_app-icon-s/p/fcf326e2-9524-11e6-9fb1-00163ec9f5fa/3499352888/bing-translator-windows-10-icon.png
// @grant        none
// @version      2.0
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
            return bingResult.innerText;
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
            event.preventDefault();
            const translatedText = getTranslatedText();
            if (translatedText) {
                copyPlainText(translatedText.trim());
            }
        }

        // Alt + S for swapping languages
        if (event.altKey && event.key === 's') {
            event.preventDefault();
            const bingSwapButton = document.querySelector('div#tta_revIcon');
            clickElement(bingSwapButton);
        }

        // Alt + A for toggling between Casual and Formal tones
        if (event.altKey && event.key === 'a') {
            event.preventDefault();

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

        // --- Helper functions for anchor-based splitting (isSpecial, escapeRegex) remain the same ---
        const urlRegexSimple = /^(https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/;
        const emailRegexSimple = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        function isSpecial(line) {
            const trimmed = line.trim();
            return urlRegexSimple.test(trimmed) ||
                   emailRegexSimple.test(trimmed);
        }

        function escapeRegex(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

            // MODIFIED: Output segmentation logic (from previous step by user)
            let outputSegments = [];
            const trimmedOutputText = currentOutputText.trim();

            if (trimmedOutputText.length > 0) {
                // Primary method for segmenting output: split into sentences.
                // This regex splits by common sentence terminators (. ! ?).
                outputSegments = trimmedOutputText.match(/[^.!?]+(?:[.!?]+|$)/g) || [trimmedOutputText];
                outputSegments = outputSegments.map(s => s.trim()).filter(s => s.length > 0);
            }

            // Safety net: If sentence splitting resulted in no segments but there was text,
            // use the whole trimmed block.
            // This is unlikely if the regex above has `|| [trimmedOutputText]`.
            if (outputSegments.length === 0 && trimmedOutputText.length > 0) {
                outputSegments = [trimmedOutputText];
            }

            let restoredOutputArray = [];
            let outputIndex = 0;
            // Correlate input lines with output segments
            for (let i = 0; i < inputLines.length; i++) {
                const inputLineTrimmed = inputLines[i].trim();
                if (inputLineTrimmed === '') {
                    restoredOutputArray.push('');
                } else {
                    // If there's a corresponding output segment, use it
                    if (outputIndex < outputSegments.length) {
                        restoredOutputArray.push(outputSegments[outputIndex]);
                        outputIndex++;
                    } else {
                        // If output is shorter than input
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
                for (let k = restoredOutputArray.length - 1; k >= 0; k--) {
                    if (restoredOutputArray[k] !== '') {
                        // Careful concatenation from version 1.4
                        if (restoredOutputArray[k].length > 0 &&
                            outputSegments[outputIndex].length > 0 &&
                            !/\s$/.test(restoredOutputArray[k]) &&
                            !/^\s/.test(outputSegments[outputIndex])) {
                            restoredOutputArray[k] += ' ';
                        }
                        restoredOutputArray[k] += outputSegments[outputIndex];
                        foundSpot = true;
                        break;
                    }
                }
                // If all previous lines were empty, just push the segment as a new line.
                if (!foundSpot) {
                    restoredOutputArray.push(outputSegments[outputIndex]);
                }
                outputIndex++;
            }

            let restoredOutput = restoredOutputArray.join('\n');

            // Post-processing for email addresses (from version 1.4)
            let finalOutputLines = restoredOutput.split('\n');
            for (let i = 0; i < finalOutputLines.length; i++) {
                if (finalOutputLines[i].includes('@')) {
                    finalOutputLines[i] = finalOutputLines[i].replace(/\.\s+/g, '.');
                }
            }
            const processedOutput = finalOutputLines.join('\n');
            if (outputDiv.innerText !== processedOutput) {
                outputDiv.innerText = processedOutput;
                triggerOutputEvents(outputDiv); // Notify Bing of the change
            }
        }


        // --- Monitoring setup ---
        // Observe changes in both input and output areas to reprocess line breaks.
        const config = { childList: true, subtree: true, characterData: true, attributes: true };

        const inputTextarea = document.querySelector('#tta_input_ta');
        if (inputTextarea) {
            new MutationObserver(processTranslationLineBreaks).observe(inputTextarea, { childList: true, characterData: true, subtree: true });
            // Also trigger on direct input events for faster response.
            inputTextarea.addEventListener('input', () => setTimeout(processTranslationLineBreaks, 50));
        }

        const outputDiv = document.querySelector('#tta_output_ta');
        if (outputDiv) {
            // Observe the output div for changes (e.g., when Bing updates translation)
            new MutationObserver(processTranslationLineBreaks).observe(outputDiv, config);
        }

        // Fallback: Periodically check, in case mutation observers miss something or are too slow.
        setInterval(processTranslationLineBreaks, 750);
    }

    let fixedCopyButtonInitialized = false;

    /**
     * Overrides Bing's default copy button behavior to copy plain text only
     * and positions it in the new custom top bar.
     */
    function overrideBingCopyButton() {
        if (!window.location.hostname.includes('bing.com')) return;
        if (fixedCopyButtonInitialized) return; // Ensure it only runs once

        const originalCopyButton = document.querySelector('div#tta_copyIcon');
        let svgHtml = '';
        if (originalCopyButton) {
            svgHtml = originalCopyButton.innerHTML; // Get the SVG content
            originalCopyButton.style.display = 'none'; // Hide the original button
            // Also hide its parent cell if it's still taking space
            const parentCell = originalCopyButton.closest('td.tta_swapcell');
            if (parentCell) {
                parentCell.style.display = 'none';
            }
        }

        let fixedCopyButton = document.getElementById('fixed_tta_copyIcon');
        if (!fixedCopyButton) {
            const customTopBar = document.getElementById('custom_top_bar');
            if (!customTopBar) {
                console.error('Custom top bar not found to place copy button.');
                return; // Exit if top bar isn't ready
            }
            fixedCopyButton = document.createElement('div');
            fixedCopyButton.id = 'fixed_tta_copyIcon'; // A new ID for the fixed button
            fixedCopyButton.innerHTML = svgHtml; // Populate with original SVG
            fixedCopyButton.title = 'Copy'; // Set initial title
            fixedCopyButton.setAttribute('data-plain-text-override', 'true');
            customTopBar.appendChild(fixedCopyButton); // Append to the custom top bar

            fixedCopyButton.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();

                const outputTextarea = document.querySelector('#tta_output_ta');

                if (outputTextarea && outputTextarea.innerText) {
                    copyPlainText(outputTextarea.innerText.trim());

                    const originalTitle = fixedCopyButton.title;
                    fixedCopyButton.title = 'Copied!';
                    fixedCopyButton.style.opacity = '0.6';

                    setTimeout(() => {
                        fixedCopyButton.title = originalTitle;
                        fixedCopyButton.style.opacity = '';
                    }, 1000);
                }
            });
            fixedCopyButtonInitialized = true;
        }

        // Observer to ensure the original button remains hidden if it reappears
        const observer = new MutationObserver(() => {
            const currentOriginalCopyButton = document.querySelector('div#tta_copyIcon');
            if (currentOriginalCopyButton && currentOriginalCopyButton.id !== 'fixed_tta_copyIcon' && currentOriginalCopyButton.style.display !== 'none') {
                 currentOriginalCopyButton.style.display = 'none'; // Ensure original is hidden
                 const parentCell = currentOriginalCopyButton.closest('td.tta_swapcell');
                 if (parentCell) {
                    parentCell.style.display = 'none';
                 }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
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
        selectLanguage('#tta_tgtsl', 'French (Canada)'); // Target: French (Canada)
    }

    /**
     * Selects a specific tone from the Bing Translate tone dropdown.
     * @param {string} toneText - The exact text of the tone option to select.
     */
    function selectTone(toneText) {
        if (!window.location.hostname.includes('bing.com')) return;
        const toneSelectElement = document.querySelector('#tta_tonesl');
        if (!toneSelectElement) {
            console.warn('Tone select element (#tta_tonesl) not found.');
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
            /* Hide Bing's default header, specific navigation bar, footer, and phrasebook for a cleaner interface */
            #theader, nav, .t_navlinkitem, #b_footerItems, #tta_phrasebook {
                display: none !important;
            }

            /* Global layout for full screen and proper flex stacking */
            html, body {
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important; /* Control overall scrolling and prevent unwanted scrollbars */
                display: flex !important; /* Make body a flex container */
                flex-direction: column !important; /* Stack custom top bar and main content vertically */
                min-width: 0 !important; /* Ensure they can shrink horizontally */
            }

            /* Custom Top Bar for elements like the copy button */
            #custom_top_bar {
                width: 100% !important;
                height: 50px !important; /* Define height for the bar */
                background-color: #f0f0f0 !important; /* Light grey background */
                display: flex !important;
                align-items: center !important; /* Vertically center content */
                justify-content: center !important; /* Center the copy button horizontally */
                padding: 0 15px !important; /* Some horizontal padding */
                box-sizing: border-box;
                flex-shrink: 0 !important; /* Prevent it from shrinking */
                min-width: 0 !important; /* Ensure it can shrink horizontally */
            }

            /* Main content area (Bing Translator UI) takes remaining vertical space */
            #app, #b_content, .main, .b_frame, .b_container, .b_translatorContainer, .b_translator,
            #tt_translatorHome, #tt_txtContrl, #rich_tta {
                flex: 1 !important; /* Allow these to grow and take remaining vertical space */
                width: 100% !important;
                max-width: none !important; /* Remove any max-width restrictions */
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box;
                display: flex !important; /* Make them flex containers for their children */
                flex-direction: column !important; /* Stack children vertically */
                min-width: 0 !important; /* Ensure they can shrink horizontally */
            }

            /* The translation table and its internal structure for full dynamic resizing */
            table.tta_tbl {
                flex: 1 !important; /* Takes remaining space in column layout */
                height: auto !important; /* Let flex control height, not fixed 100% */
                width: 100% !important; /* Ensure full horizontal space */
                table-layout: fixed !important; /* Distribute columns evenly */
                border-collapse: collapse !important;
                margin: 0 !important;
                min-width: 0 !important; /* Ensure it can shrink horizontally */
                display: flex !important; /* Make table a flex container */
                flex-direction: column !important; /* Stack tbody vertically */
            }
            table.tta_tbl > tbody {
                flex: 1 !important; /* Take remaining space in flex column layout */
                display: flex !important; /* Make tbody a flex container */
                flex-direction: column !important; /* Stack tr vertically */
            }
            tr.tta_tableRow, table.tta_tbl > tbody > tr {
                width: 100% !important;
                height: 100% !important; /* Rows should fill table height */
                display: flex !important; /* Make tr a flex container */
                flex: 1 !important; /* Allows cells to stretch in height */
            }

            /* Input and output cells should each take 50% width and full height */
            td.tta_incell, td.tta_outcell {
                flex: 1 !important; /* Take equal remaining horizontal space */
                height: 100% !important; /* Take full height of parent row */
                padding: 5px !important;
                box-sizing: border-box;
                vertical-align: top !important;
                min-width: 0 !important; /* Ensure they can shrink horizontally */
            }

            /* Flexbox for input/output containers to manage height */
            #tta_in, #tta_out {
                display: flex !important;
                flex-direction: column !important;
                width: 100% !important;
                height: 100% !important; /* Take full height of parent cell */
                min-height: unset !important; /* Remove fixed minimum height that might prevent full dynamic resize */
                align-items: stretch !important; /* Stretch children to fill width */
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box;
                min-width: 0 !important; /* Ensure they can shrink horizontally */
            }

            /* Text areas (input and output) to fill available space dynamically */
            #tta_input_ta, #tta_output_ta {
                font-size: 24px !important;
                flex: 1 !important; /* Allow them to grow and shrink dynamically */
                height: 100% !important; /* Take full height within their flex parent */
                width: 100% !important;
                box-sizing: border-box !important;
                padding: 15px !important;
                resize: none !important; /* Prevent manual resizing by user */
                overflow-y: auto !important; /* Add scrollbar if content overflows vertically */
                white-space: pre-wrap !important; /* Preserve line breaks and spaces */
                word-wrap: break-word !important; /* Break long words to prevent horizontal scroll */
                min-width: 0 !important; /* Ensure they can shrink horizontally */
            }
            /* Ensure the parent boxes of textareas also flex correctly */
            .tta_inputbox, .tta_outputbox {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-width: 0 !important; /* Ensure they can shrink horizontally */
            }

            /* Hide the original swap button's cell */
            td.tta_swapcell {
                display: none !important;
            }

            /* Styling for the new custom copy button (now inside custom_top_bar) */
            #fixed_tta_copyIcon {
                position: relative !important; /* Positioned within its flex parent (custom_top_bar) */
                top: unset !important; /* Remove fixed positioning */
                left: unset !important;
                background-color: #dcdcdc !important; /* Light grey */
                width: 48px !important; /* Adjusted size for top bar */
                height: 48px !important;
                padding: 8px !important;
                border-radius: 4px !important; /* Slightly smaller border-radius for cleaner look */
                transition: background-color 0.2s ease !important;
                flex-shrink: 0 !important; /* Don't let it shrink */
                display: flex !important; /* Make it a flex container to center SVG */
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
            }
            #fixed_tta_copyIcon:hover {
                background-color: #cccccc !important; /* Slightly darker on hover */
            }
            #fixed_tta_copyIcon svg {
                width: 32px !important; /* Adjusted icon size to fit the smaller button */
                height: 32px !important;
                fill: rgb(105, 151, 224) !important; /* New blue color for the icon */
            }
        `;
        document.head.appendChild(style);
    }

    // Initialize functions after the page has loaded.
    function initialize() {
        // 1. Create and prepend the custom top bar element
        const customTopBar = document.createElement('div');
        customTopBar.id = 'custom_top_bar';
        document.body.prepend(customTopBar); // Add it at the very top of the body

        applyCustomStyles(); // Apply styles after custom elements are created
        preserveBingLineBreaks();
        overrideBingCopyButton(); // This will now append to customTopBar
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
