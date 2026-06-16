import { useEffect } from 'react';

/**
 * Custom hook for registering global keyboard shortcuts in the POS system.
 * @param {Object} shortcutMap - A mapping of key names to callback functions.
 *                              e.g., { 'F1': () => focusPhone(), 'Escape': () => clearCart() }
 */
export function useKeyboardShortcuts(shortcutMap) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const { key } = event;
      if (shortcutMap[key]) {
        // Prevent default browser shortcuts (e.g., F1 browser help, F3 find, etc.)
        event.preventDefault();
        shortcutMap[key](event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcutMap]);
}
