// Minimalseite. Umgebung und Ampel kommen in der naechsten Etappe dazu.
const wurzel = document.querySelector<HTMLElement>('#app');

if (wurzel !== null) {
  const titel = document.createElement('h1');
  titel.textContent = 'Knipsa';
  wurzel.append(titel);
}
