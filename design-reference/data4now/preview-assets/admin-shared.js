// Shared admin interactions
document.querySelectorAll('.row-chk').forEach(c => {
  c.addEventListener('click', e => {
    e.stopPropagation();
    c.classList.toggle('is-on');
    const row = c.closest('tr');
    if (row) row.classList.toggle('is-selected', c.classList.contains('is-on'));
  });
});
document.querySelectorAll('.ah-subnav-tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.ah-subnav-tab').forEach(o => o.classList.remove('is-current'));
    t.classList.add('is-current');
  });
});
document.querySelectorAll('.ah-filter-chip').forEach(c => {
  c.addEventListener('click', () => c.classList.toggle('is-on'));
});
