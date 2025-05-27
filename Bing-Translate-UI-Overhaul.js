// ==UserScript==
// @name         Bing Translate UI Overhaul (Merged V3)
// @author       tdun2621 (Modified by AI)
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
                outputSegments = currentOutputText.split(regex).map(s => s.trim()).filter(s => s.length > 0);
            } else if (trimmedOutputText.length > 0) {
                 // Fallback: Try sentence splitting
                 outputSegments = currentOutputText.match(/[^.!?]+(?:[.!?]+|$)/g) || [currentOutputText];
                 outputSegments = outputSegments.map(s => s.trim()).filter(s => s.length > 0);
            }

            // If still empty/failed, use the whole block
            if(outputSegments.length === 0 && trimmedOutputText.length > 0) {
                outputSegments = [trimmedOutputText];
            }


            let restoredOutputArray = [];
            let outputIndex = 0;

            for (let i = 0; i < inputLines.length; i++) {
                const inputLineTrimmed = inputLines[i].trim();

                if (inputLineTrimmed === '') {
                    restoredOutputArray.push('');
                } else {
                    if (outputIndex < outputSegments.length) {
                        restoredOutputArray.push(outputSegments[outputIndex]);
                        outputIndex++;
                    } else {
                        console.warn("Input/Output alignment mismatch? Pushing empty.");
                        restoredOutputArray.push('');
                    }
                }
            }
            
             while (outputIndex < outputSegments.length) {
                 console.warn("Appending extra output segment.");
                 let foundSpot = false;
                 for(let k = restoredOutputArray.length - 1; k >= 0; k--) {
                     if(restoredOutputArray[k] !== '') {
                        restoredOutputArray[k] += ' ' + outputSegments[outputIndex];
                        foundSpot = true;
                        break;
                     }
                 }
                 if(!foundSpot) restoredOutputArray.push(outputSegments[outputIndex]);
                 outputIndex++;
             }

            const restoredOutput = restoredOutputArray.join('\n');

            if (outputDiv.innerText !== restoredOutput) {
                outputDiv.innerText = restoredOutput;
                triggerOutputEvents(outputDiv);
            }
        }


        // --- Monitoring setup ---
        const config = { childList: true, subtree: true, characterData: true, attributes: true };

        const inputTextarea = document.querySelector('#tta_input_ta');
        if (inputTextarea) {
            new MutationObserver(processTranslationLineBreaks).observe(inputTextarea, { childList: true, characterData: true, subtree: true });
            inputTextarea.addEventListener('input', () => setTimeout(processTranslationLineBreaks, 50));
        }

        const outputDiv = document.querySelector('#tta_output_ta');
        if (outputDiv) {
            new MutationObserver(processTranslationLineBreaks).observe(outputDiv, config);
        }

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
                copyButton.setAttribute('data-plain-text-override', 'true');
                const newCopyButton = copyButton.cloneNode(true);
                copyButton.parentNode.replaceChild(newCopyButton, copyButton);

                newCopyButton.addEventListener('click', function(event) {
                    event.preventDefault();
                    event.stopPropagation();

                    const outputTextarea = document.querySelector('#tta_output_ta');
                    if (outputTextarea && outputTextarea.innerText) {
                        copyPlainText(outputTextarea.innerText.trim());

                        const originalTitle = newCopyButton.title;
                        newCopyButton.title = 'Copied!';
                        newCopyButton.style.opacity = '0.6';

                        setTimeout(() => {
                            newCopyButton.title = originalTitle;
                            newCopyButton.style.opacity = '';
                        }, 1000);
                    }
                });
            }
        }

        findAndOverrideCopyButton();
        setTimeout(findAndOverrideCopyButton, 1000);
        setTimeout(findAndOverrideCopyButton, 3000);

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

        function selectLanguage(dropdownSelector, languageText) {
            const dropdownButton = document.querySelector(dropdownSelector);
            if (dropdownButton) {
                if (dropdownButton.textContent.trim() === languageText) {
                    return;
                }
                clickElement(dropdownButton);

                const languageListObserver = new MutationObserver((mutations, observer) => {
                    const languageOption = Array.from(document.querySelectorAll('.tta_menu_item'))
                        .find(item => item.textContent.trim() === languageText);
                    if (languageOption) {
                        clickElement(languageOption);
                        observer.disconnect();
                        setTimeout(() => {
                            if (dropdownButton.getAttribute('aria-expanded') === 'true') {
                                clickElement(dropdownButton);
                            }
                        }, 100);
                    }
                });
                languageListObserver.observe(document.body, { childList: true, subtree: true });
            }
        }

        selectLanguage('#tta_srcsl', 'English (detected)');
        selectLanguage('#tta_tgtlang', 'French (Canada)');
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
        if (toneSelectElement.value === toneText) {
            return;
        }
        toneSelectElement.value = toneText;
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
            #theader, .t_navlinkitem, #b_footerItems {
                display: none !important;
            }
            html, body {
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: auto !important;
            }
            #app, #b_content, .main, .b_frame, .b_container, .b_translatorContainer, .b_translator,
            #tt_translatorHome, #tt_txtContrl, #rich_tta, table.tta_tbl {
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box;
            }
            table.tta_tbl {
                table-layout: fixed !important;
                border-collapse: collapse !important;
            }
            tr.tta_tableRow, table.tta_tbl > tbody > tr {
                width: 100% !important;
                display: table-row !important;
            }
            td.tta_incell, td.tta_outcell {
                width: 50% !important;
                padding: 5px !important;
                box-sizing: border-box;
                vertical-align: top !important;
                min-width: unset !important;
            }
            #tta_in, #tta_out {
                display: flex !important;
                flex-direction: column !important;
                width: 100% !important;
                min-height: 65vh !important;
                height: auto !important;
                align-items: stretch !important;
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box;
            }
            #tta_input_ta, #tta_output_ta {
                font-size: 24px !important;
                min-height: 60vh !important;
                height: auto !important;
                width: 100% !important;
                box-sizing: border-box !important;
                padding: 15px !important;
                resize: vertical !important;
                overflow-y: auto !important;
                white-space: pre-wrap !important;
                word-wrap: break-word !important;
                min-width: unset !important;
            }
            .tta_inputbox, .tta_outputbox {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-width: unset !important;
            }
            td.tta_swapcell {
                width: auto !important;
                padding: 5px !important;
                vertical-align: middle !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Initialize functions after the page has loaded.
    function initialize() {
        applyCustomStyles();
        preserveBingLineBreaks();
        overrideBingCopyButton();
        setDefaultLanguages();
        selectTone('Casual');
        document.addEventListener('keydown', handleKeydown, false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
