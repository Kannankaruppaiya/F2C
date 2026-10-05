// Phase 1 browser walkthrough: auth, clients, projects, features, tasks, timer, business rules, search.
import { BASE as B, launch, newPage, stepper } from "./lib.mjs";

(async () => {
  const browser = await launch();
  const errors = [];
  const page = await newPage(browser, errors);
  const step = stepper();
  await page.goto(B + '/login');
  await page.fill('#email', 'demo@pcc.dev'); await page.fill('#password', 'wrong-password');
  await page.click('button[type=submit]');
  await page.getByText('Incorrect email or password').waitFor(); step('bad login rejected');
  await page.fill('#password', 'demo-password-2026'); await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard'); step('login');

  // client
  await page.goto(B + '/clients/new');
  await page.click('button[type=submit]');
  await page.getByText('Required').first().waitFor(); step('client validation');
  await page.fill('#name', 'Acme Test Co'); await page.fill('#email', 'not-an-email');
  await page.click('button[type=submit]');
  await page.getByText('Invalid email').waitFor(); step('email validation');
  await page.fill('#email', 'ops@acme.example'); await page.fill('#website', 'https://acme.example');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/clients\/c/); step('client created ' + page.url());
  // contact
  await page.getByRole('button', { name: 'Add contact' }).first().click();
  await page.fill('#c-name', 'Jane Doe'); await page.check('input[name=isPrimary]');
  await page.getByRole('button', { name: 'Add contact' }).last().click();
  await page.getByText('Jane Doe').first().waitFor(); step('contact added');

  // project
  await page.getByRole('link', { name: 'New project' }).click();
  await page.waitForURL(/projects\/new/);
  await page.fill('#name', 'Acme Portal'); await page.fill('#startDate', '2026-10-01'); await page.fill('#dueDate', '2026-09-01');
  await page.fill('#contractValue', '120000');
  await page.click('button[type=submit]');
  await page.getByText('Expected delivery must be on or after').waitFor(); step('date order validation');
  await page.fill('#dueDate', '2026-12-15');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/projects\/c[a-z0-9]+$/); const proj = page.url(); step('project created ' + proj);
  await page.getByText('Discovery').first().waitFor(); step('standard phases present');

  // feature
  await page.goto(proj + '/features?new=1');
  await page.fill('#f-name', 'SSO Login'); await page.fill('#f-hours', '10');
  await page.fill('#f-ac', 'Google login works\nMicrosoft login works');
  await page.getByRole('button', { name: 'Add feature', exact: true }).last().click();
  await page.getByText('Google login works').waitFor(); step('feature with criteria');
  await page.getByText('Google login works').click();
  await page.waitForTimeout(800); step('criterion toggled');

  // tasks
  const pid = proj.split('/').pop();
  await page.goto(B + '/tasks/new?projectId=' + pid);
  await page.fill('#title', 'Base task'); await page.fill('#estimatedHours', '3');
  await page.click('button[type=submit]'); await page.waitForURL(/\/tasks\/c/); const t1 = page.url(); step('task 1');
  await page.goto(B + '/tasks/new?projectId=' + pid);
  await page.fill('#title', 'Dependent task');
  const v = await page.locator('#dependsOnIds option', { hasText: 'Base task' }).last().getAttribute('value'); await page.selectOption('#dependsOnIds', v);
  await page.click('button[type=submit]'); await page.waitForURL(/\/tasks\/c/); step('task 2 with dependency');
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await page.getByText(/complete dependencies first/).waitFor(); step('dependency rule enforced');
  await page.goto(t1);
  await page.getByRole('button', { name: 'Start timer' }).click();
  await page.getByRole('button', { name: 'Stop timer' }).first().waitFor(); step('timer started, status ' + await page.locator('text=In Progress').count());
  await page.getByRole('button', { name: 'Stop timer' }).first().click();
  await page.getByRole('button', { name: 'Start timer' }).waitFor(); step('timer stopped');
  await page.fill('input[name=hours]', '2'); await page.getByRole('button', { name: 'Log time' }).click();
  await page.getByText('2h', { exact: true }).first().waitFor(); step('time logged');
  await page.fill('input[name=title]', 'Write tests'); await page.getByRole('main').getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByText('Write tests').waitFor(); step('subtask');
  await page.fill('textarea[name=body]', 'Looks good'); await page.getByRole('button', { name: 'Comment' }).click();
  await page.getByText('Looks good').waitFor(); step('comment');
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await page.getByRole('button', { name: 'Reopen' }).waitFor(); step('task completed');

  // handover rule
  await page.goto(proj);
  await page.selectOption('select[name=status]', 'ACTIVE'); await page.waitForTimeout(1500);
  await page.selectOption('select[name=status]', 'COMPLETED');
  await page.getByText(/Complete the required handover items first/).waitFor(); step('handover rule enforced');

  // search
  await page.keyboard.press('Control+k');
  await page.fill('input[aria-label=Search]', 'Acme');
  await page.getByText('Acme Portal').last().waitFor(); step('cmd+k search');
  await page.keyboard.press('Escape');
  await page.goto(proj + '/activity');
  if (errors.length) throw new Error('Page errors: ' + errors.join('; '));
  console.log('Phase 1 walkthrough passed');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
