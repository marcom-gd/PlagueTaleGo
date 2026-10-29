export const avatars = [
  ['rat', 'Rat'], ['dog', 'Dog'], ['cat', 'Cat'], ['bird', 'Bird'],
  ['duck', 'Bathtub Duck'], ['agent47', 'Agent 47'], ['lara', 'Lara Croft']
];
export const profileColors = ['#3975b9','#a555a0','#c65c4c','#398777','#b17a24','#6f69bd','#b24c75','#4c813b'];

// Original 64 × 64 pixel silhouettes, drawn on a 32px grid.
const silhouettes = {
  rat: 'M4 23H2V17H4V21H8V17H10V13H16V9H20V7H24V9H26V13H28V17H31V19H28V21H24V23H22V26H18V24H14V26H10V24H8V23Z M18 9V5H22V9Z',
  dog: 'M7 15H5V10H7V12H11V14H18V10H20V6H24V8H28V12H31V16H27V20H25V26H21V21H16V26H12V21H9V26H5V20H7Z M18 8H20V14H17V10H18Z',
  cat: 'M10 13V5H12V7H14V9H20V7H22V5H24V15H22V19H24V26H9V24H5V22H3V16H5V20H7V22H11V18H10Z',
  bird: 'M4 19H8V16H10V13H16V9H18V7H22V9H24V11H29V13H24V18H22V21H19V25H22V27H16V23H13V26H10V24H12V21H8V23H4V25H2V21H4Z M10 13V9H8V7H11V9H13V13Z',
  duck: 'M4 18H8V20H13V17H16V15H14V11H16V7H22V9H24V12H29V15H23V18H25V23H23V26H9V24H6V22H4Z',
  agent47: 'M12 4H20V6H22V14H20V17H19V19H24V21H26V28H6V21H8V19H13V17H12V14H10V6H12Z',
  lara: 'M13 4H21V6H23V12H25V16H27V22H25V18H23V15H21V17H19V19H23V21H25V28H19V25H13V28H7V21H9V19H13V17H11V14H9V8H11V6H13Z'
};
export function avatarSvg(id) {
  const detail = id === 'agent47' ? '<path d="M15 19h2v3h1l-2 5-2-5h1z" fill="var(--avatar-cutout)"/>' :
    id === 'lara' ? '<path d="M11 20h2v5h-2zm8 0h2v5h-2z" fill="var(--avatar-cutout)"/>' :
    '<path d="M21 11h2v2h-2z" fill="var(--avatar-cutout)"/>';
  return `<svg viewBox="0 0 64 64" aria-hidden="true" shape-rendering="crispEdges"><g transform="scale(2)"><path d="${silhouettes[id] || silhouettes.rat}" fill="currentColor"/>${detail}</g></svg>`;
}
export function validProfile(profile) {
  return profile && typeof profile.nickname === 'string' && profile.nickname.trim().length > 0 &&
    profile.nickname.length <= 32 && avatars.some(([id]) => id === profile.avatar) && typeof profile.color === 'string' && /^#[0-9a-f]{6}$/i.test(profile.color);
}
