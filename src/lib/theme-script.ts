// Ohne "use client": wird im Server-Layout als Text in den <head> geschrieben
export const THEME_KEY = "theme";

// Läuft vor React im <head>, damit die Seite gleich in der richtigen Darstellung erscheint
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
