const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('#nav-links');

function setNav(open) {
    navLinks.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}

menuToggle.addEventListener('click', () => setNav(!navLinks.classList.contains('is-open')));
navLinks.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setNav(false)));

document.querySelectorAll('[data-security-service]').forEach((link) => {
    link.addEventListener('click', () => {
        const service = document.querySelector('#service');
        service.value = link.dataset.securityService;
    });
});

const clock = document.querySelector('#clock');
const feedTime = document.querySelector('#feed-time');
const log = document.querySelector('#log');
const timeNow = () => new Date().toLocaleTimeString('en-GB');

function tick() {
    const currentTime = timeNow();
    clock.textContent = currentTime;
    feedTime.textContent = currentTime;
}

tick();
window.setInterval(tick, 1000);

const events = [
    ['Gate A', 'Motion detected after hours', 'Checking', 'warn'],
    ['Gate A', 'Operator confirmed staff vehicle', 'Cleared', 'ok'],
    ['Warehouse', 'Side door contact opened', 'Checking', 'warn'],
    ['Warehouse', 'Patrol unit sent to door', 'Dispatched', 'alert'],
    ['Warehouse', 'Patrol on site, door secured', 'Cleared', 'ok'],
    ['Car park', 'Camera health check passed', 'Normal', 'ok'],
    ['Front desk', 'Visitor badge issued', 'Logged', 'ok'],
];
let eventIndex = 0;
const maxRows = 4;

function addEvent() {
    const [zone, text, status, level] = events[eventIndex % events.length];
    eventIndex += 1;
    const row = document.createElement('li');
    const time = document.createElement('time');
    const zoneElement = document.createElement('b');
    const message = document.createElement('span');
    const pill = document.createElement('span');
    time.textContent = timeNow().slice(0, 5);
    zoneElement.textContent = zone;
    message.textContent = text;
    pill.className = `pill ${level}`;
    pill.textContent = status;
    row.append(time, zoneElement, message, pill);
    log.prepend(row);
    while (log.children.length > maxRows) log.lastElementChild.remove();
}

for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) addEvent();
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) window.setInterval(addEvent, 3800);

const tabs = [...document.querySelectorAll('[role="tab"]')];
const panels = [...document.querySelectorAll('[role="tabpanel"]')];

function selectTab(tab) {
    tabs.forEach((currentTab, tabIndex) => {
        const active = currentTab === tab;
        currentTab.setAttribute('aria-selected', String(active));
        currentTab.tabIndex = active ? 0 : -1;
        panels[tabIndex].hidden = !active;
    });
    tab.focus();
}

tabs.forEach((tab, tabIndex) => {
    tab.addEventListener('click', () => {
        if (tab.dataset.servicePage) {
            window.location.href = tab.dataset.servicePage;
            return;
        }
        selectTab(tab);
    });
    tab.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') selectTab(tabs[(tabIndex + 1) % tabs.length]);
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') selectTab(tabs[(tabIndex - 1 + tabs.length) % tabs.length]);
    });
});

const quoteForm = document.querySelector('#quote-form');
const formStatus = document.querySelector('.form-status');

quoteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    let firstInvalidField = null;
    quoteForm.querySelectorAll('[required]').forEach((field) => {
        const invalid = !field.checkValidity();
        field.setAttribute('aria-invalid', String(invalid));
        if (invalid && !firstInvalidField) firstInvalidField = field;
    });
    if (firstInvalidField) {
        formStatus.className = 'form-status error';
        formStatus.textContent = 'Please complete the highlighted fields.';
        firstInvalidField.focus();
        return;
    }
    const submitButton = quoteForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Sending request...';
    try {
        const response = await fetch('/api/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(new FormData(quoteForm))),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Request failed.');
        formStatus.className = 'form-status';
        formStatus.textContent = 'Thanks. An Eagle specialist will call you back within one working day.';
        quoteForm.reset();
        quoteForm.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
    } catch (error) {
        formStatus.className = 'form-status error';
        formStatus.textContent = 'The request could not be sent. Please call the control room directly.';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Request a callback';
    }
});
