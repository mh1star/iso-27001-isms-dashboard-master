// سلوك الواجهة المشتركة لنظام إدارة أمن المعلومات — العربية وRTL.
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  const main = document.querySelector('main');
  if (!main) return;

  const dictionary = {
    'Web Server': 'خادم الويب', 'Customer Database': 'قاعدة بيانات العملاء', 'Employee Laptops': 'أجهزة حاسوب الموظفين',
    'Server': 'خادم', 'Database': 'قاعدة بيانات', 'Hardware': 'أجهزة ومعدات', 'IT Department': 'إدارة تقنية المعلومات',
    'Data Protection Officer': 'مسؤول حماية البيانات', 'HR Department': 'إدارة الموارد البشرية', 'Data Center A': 'مركز البيانات أ', 'Secure Cloud': 'السحابة الآمنة', 'Distributed': 'موزعة',
    'Unauthorized Data Access': 'وصول غير مصرح به إلى البيانات', 'Phishing Attack': 'هجوم تصيد احتيالي', 'Data Security': 'أمن البيانات', 'Human Factor': 'العامل البشري',
    'Implement multi-factor authentication': 'تطبيق المصادقة متعددة العوامل', 'Enhanced security awareness training': 'تعزيز التدريب على التوعية الأمنية',
    'Suspicious Login Attempt': 'محاولة تسجيل دخول مشبوهة', 'Malware Detection': 'اكتشاف برمجية خبيثة', 'Access Control': 'التحكم بالوصول', 'Malware': 'البرمجيات الخبيثة',
    'Security Monitoring System': 'نظام المراقبة الأمنية', 'Antivirus System': 'نظام مكافحة الفيروسات', 'Security Team': 'فريق الأمن', 'IT Security': 'أمن تقنية المعلومات',
    'Information Security Policy': 'سياسة أمن المعلومات', 'Access Control Policy': 'سياسة التحكم بالوصول', 'Security': 'الأمن',
    'Information Security Policies': 'سياسات أمن المعلومات', 'Management of Technical Vulnerabilities': 'إدارة الثغرات التقنية', 'Systems Security': 'أمن الأنظمة', 'Organizational': 'تنظيمي',
    'Internal Security Audit Q1 2024': 'التدقيق الأمني الداخلي — الربع الأول 2024', 'ISO 27001 Certification Audit': 'تدقيق اعتماد ISO 27001',
    'Internal Audit Team': 'فريق التدقيق الداخلي', 'External Certification Body': 'جهة الاعتماد الخارجية',
    'Open': 'مفتوح', 'In Progress': 'قيد التنفيذ', 'Resolved': 'تم الحل', 'Active': 'نشط', 'Implemented': 'مطبق', 'Partially Implemented': 'مطبق جزئيًا', 'Not Implemented': 'غير مطبق', 'Completed': 'مكتمل', 'Scheduled': 'مجدول',
    'High': 'مرتفع', 'Medium': 'متوسط', 'Low': 'منخفض', 'Critical': 'حرج', 'Very Low': 'منخفض جدًا', 'Very High': 'مرتفع جدًا',
    'Internal': 'داخلي', 'External': 'خارجي', 'Open Risks': 'المخاطر المفتوحة', 'Open Incidents': 'الحوادث المفتوحة',
  };

  const translate = (value) => {
    let result = value;
    Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length).forEach(([from, to]) => {
      result = result.split(from).join(to);
    });
    return result.replace(/(\d+) days? ago/g, 'منذ $1 أيام')
      .replace(/(\d+) day ago/g, 'منذ يوم واحد')
      .replace(/a few seconds ago/g, 'منذ لحظات')
      .replace(/an hour ago/g, 'منذ ساعة')
      .replace(/(\d+) hours? ago/g, 'منذ $1 ساعات');
  };

  const translateTextNodes = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (node.parentElement?.closest('script, style, .app-search, .app-notification-menu')) return;
      const translated = translate(node.nodeValue);
      if (translated !== node.nodeValue) node.nodeValue = translated;
    });
  };
  translateTextNodes(document.body);

  const header = main.querySelector('.pt-3 > .d-flex');
  if (header) {
    const menu = document.createElement('button');
    menu.className = 'mobile-menu';
    menu.type = 'button';
    menu.setAttribute('aria-label', 'فتح القائمة');
    menu.innerHTML = '<i class="fas fa-bars"></i>';
    header.prepend(menu);
    menu.addEventListener('click', () => sidebar?.classList.toggle('is-open'));

    const tools = document.createElement('div');
    tools.className = 'app-topbar';
    tools.innerHTML = `
      <span class="app-system-status"><i class="fas fa-circle"></i> النظام يعمل</span>
      <span class="app-clock" aria-live="polite"></span>
      <label class="app-search" aria-label="البحث في الصفحة">
        <i class="fas fa-search"></i>
        <input type="search" placeholder="البحث في الوحدة..." autocomplete="off">
      </label>
      <button class="app-icon-button app-notification-button" type="button" aria-label="الإشعارات" title="الإشعارات">
        <i class="far fa-bell"></i><span class="app-notification-count">3</span>
      </button>
      <button class="app-icon-button app-theme-toggle" type="button" aria-label="تغيير المظهر" title="تغيير المظهر">
        <i class="fas fa-moon"></i>
      </button>
      <span class="app-avatar" title="مسؤول الأمن">م أ</span>
      <div class="app-notification-menu" hidden>
        <div class="app-notification-head"><strong>مركز التنبيهات</strong><span>3 جديد</span></div>
        <button type="button"><i class="fas fa-shield-halved"></i><span><b>مراجعة الضوابط</b><small>يوجد تقييم مستحق اليوم</small></span></button>
        <button type="button"><i class="fas fa-triangle-exclamation"></i><span><b>خطر مرتفع</b><small>يتطلب متابعة فريق الأمن</small></span></button>
        <button type="button"><i class="fas fa-calendar-check"></i><span><b>تدقيق قادم</b><small>موعد التدقيق خلال 30 يومًا</small></span></button>
      </div>
    `;
    header.append(tools);

    const clock = tools.querySelector('.app-clock');
    const tick = () => { clock.textContent = new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(new Date()); };
    tick();
    setInterval(tick, 30000);

    const search = tools.querySelector('input');
    search?.addEventListener('input', (event) => {
      const query = event.target.value.toLowerCase().trim();
      document.querySelectorAll('tbody tr, .policy-card, .control-card').forEach((item) => {
        item.style.display = !query || translate(item.textContent).toLowerCase().includes(query) ? '' : 'none';
      });
    });

    const notificationButton = tools.querySelector('.app-notification-button');
    const notificationMenu = tools.querySelector('.app-notification-menu');
    notificationButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      notificationMenu.hidden = !notificationMenu.hidden;
    });
    document.addEventListener('click', () => { if (notificationMenu) notificationMenu.hidden = true; });

    const themeButton = tools.querySelector('.app-theme-toggle');
    const savedTheme = localStorage.getItem('isms-theme');
    if (savedTheme === 'midnight') document.documentElement.classList.add('theme-midnight');
    const updateThemeIcon = () => { themeButton.innerHTML = document.documentElement.classList.contains('theme-midnight') ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>'; };
    updateThemeIcon();
    themeButton?.addEventListener('click', () => {
      document.documentElement.classList.toggle('theme-midnight');
      localStorage.setItem('isms-theme', document.documentElement.classList.contains('theme-midnight') ? 'midnight' : 'day');
      updateThemeIcon();
    });
  }

  document.querySelectorAll('.sidebar a').forEach((link) => link.addEventListener('click', () => sidebar?.classList.remove('is-open')));

  document.querySelectorAll('button').forEach((button) => {
    if (/(تصدير|تنزيل)/.test(button.textContent) && !button.dataset.bound) {
      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        const original = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check me-1"></i>جاهز للتصدير';
        setTimeout(() => { button.innerHTML = original; }, 1600);
      });
    }
  });

  // لوحة أوامر سريعة للتنقل بين وحدات المنصة دون مغادرة السياق.
  const commandItems = [
    ['لوحة التحكم', '/', 'fa-gauge-high'], ['إدارة الأصول', '/assets', 'fa-server'],
    ['إدارة المخاطر', '/risks', 'fa-triangle-exclamation'], ['الحوادث', '/incidents', 'fa-bell'],
    ['السياسات', '/policies', 'fa-file-shield'], ['الضوابط الأمنية', '/controls', 'fa-shield-halved'],
    ['التدقيقات', '/audits', 'fa-magnifying-glass-chart'], ['التقارير والتحليلات', '/reports', 'fa-chart-line']
  ];
  const palette = document.createElement('div');
  palette.className = 'command-palette';
  palette.hidden = true;
  palette.innerHTML = `<div class="command-backdrop"></div><div class="command-dialog" role="dialog" aria-label="التنقل السريع">
    <div class="command-heading"><i class="fas fa-wand-magic-sparkles"></i><span>التنقل السريع</span><kbd>ESC</kbd></div>
    <input class="command-input" type="search" placeholder="ابحث عن وحدة أو إجراء..." autocomplete="off">
    <div class="command-list"></div>
    <div class="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> للتنقل</span><span><kbd>Enter</kbd> للفتح</span></div>
  </div>`;
  document.body.appendChild(palette);
  const commandList = palette.querySelector('.command-list');
  const commandInput = palette.querySelector('.command-input');
  const renderCommands = (query = '') => {
    const filtered = commandItems.filter(([label]) => label.includes(query.trim()));
    commandList.innerHTML = filtered.map(([label, href, icon]) => `<a href="${href}" class="command-item"><i class="fas ${icon}"></i><span>${label}</span><i class="fas fa-arrow-left command-arrow"></i></a>`).join('') || '<div class="command-empty">لا توجد نتائج مطابقة</div>';
  };
  renderCommands();
  const openPalette = () => { palette.hidden = false; document.body.classList.add('palette-open'); setTimeout(() => commandInput.focus(), 30); };
  const closePalette = () => { palette.hidden = true; document.body.classList.remove('palette-open'); commandInput.value = ''; renderCommands(); };
  commandInput.addEventListener('input', (event) => renderCommands(event.target.value));
  palette.querySelector('.command-backdrop').addEventListener('click', closePalette);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); }
    if (event.key === 'Escape' && !palette.hidden) closePalette();
  });
  const commandButton = document.createElement('button');
  commandButton.className = 'app-command-button';
  commandButton.type = 'button';
  commandButton.innerHTML = '<i class="fas fa-sliders"></i><span>أوامر</span><kbd>Ctrl K</kbd>';
  commandButton.addEventListener('click', openPalette);
  document.querySelector('.app-topbar')?.prepend(commandButton);

  // انتقال ناعم عند فتح الصفحات وتحسين الإحساس بسرعة المنتج.
  requestAnimationFrame(() => document.body.classList.add('page-ready'));
});
