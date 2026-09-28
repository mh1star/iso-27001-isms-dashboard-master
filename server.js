const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

require('moment/locale/ar');
moment.locale('ar');

// The bundled `ar` locale renders Arabic-Indic digits (٢٠٢٦). That is wrong here:
// every count, score and percentage on the page uses Latin digits, and the
// `data-sort` attributes in the tables must stay valid ASCII or DataTables sorts
// them as text instead of chronologically. Keep the Arabic relative-time wording
// but restore Latin digits on output.
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
moment.updateLocale('ar', {
    preparse: (string) => String(string).replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d))),
    postformat: (string) => String(string).replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
});

const app = express();
const PORT = process.env.PORT || 5000;

// Every front-end library (jQuery, Bootstrap, Chart.js, DataTables, Font Awesome)
// is vendored under /vendor and served from this origin. The views previously
// pulled them from CDNs, which made the app fail outright whenever a host was
// unreachable — code.jquery.com did not resolve at all in this environment, so
// jQuery and therefore DataTables were silently dead on every list page.
const VENDOR_SCRIPT = ["'self'", "'unsafe-inline'"];
const VENDOR_STYLE = ["'self'", "'unsafe-inline'"];

// Security middleware (ISO 27001 A.14.1.3 - Security in development and support processes)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: VENDOR_STYLE,
            scriptSrc: VENDOR_SCRIPT,
            imgSrc: ["'self'", "data:"],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            // Helmet enables `upgrade-insecure-requests` by default, which rewrites
            // same-origin `/css/custom.css` and `/js/main.js` to https:// on a plain
            // HTTP server and breaks the whole stylesheet. Disable it.
            upgradeInsecureRequests: null
        }
    },
    // The views send their own X-Content-Type-Options / X-Frame-Options meta tags.
    crossOriginEmbedderPolicy: false
}));

// Rate limiting (ISO 27001 A.13.1.1 - Network controls)
// Scoped to the API and form routes: a global limiter also counted every CSS/JS/image
// request, so simply browsing a few pages returned 429 for the whole IP.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // limit each IP to 300 API/form requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

// CORS configuration. The dev default is derived from PORT so the two can never
// drift apart when the port is overridden.
const allowedOrigin = process.env.CORS_ORIGIN
    || (process.env.NODE_ENV === 'production' ? process.env.PUBLIC_ORIGIN : `http://localhost:${PORT}`);

app.use(cors({
    origin: allowedOrigin === '*' ? true : allowedOrigin,
    credentials: true
}));

// Body parser middleware
app.use(bodyParser.urlencoded({ extended: true, limit: '100kb' }));
app.use(bodyParser.json({ limit: '100kb' }));

// ---------------------------------------------------------------------------
// Input helpers — the POST handlers below are the trust boundary. Without them a
// malformed request produced NaN scores, "Invalid date" strings in the UI and a
// 500 when a view dereferenced a missing field.
// ---------------------------------------------------------------------------

const text = (value, maxLength = 200) => String(value ?? '').trim().slice(0, maxLength);

// Restricts a value to an allowed set, falling back to `fallback`.
// The views compare against English keys ('High', 'Medium', 'Active', ...), so the
// option values in the forms have to be English keys too.
const oneOf = (value, allowed, fallback) => {
    const clean = text(value, 60);
    return allowed.includes(clean) ? clean : fallback;
};

// Clamps a numeric form value into [min, max]. Returns `fallback` for NaN, so an
// empty or non-numeric input can never produce a NaN risk score.
const numberIn = (value, min, max, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
};

// Returns a `YYYY-MM-DD` string, or `fallback` when the input is not a real date.
// `moment(...)` on a bad value yields the literal text "Invalid date" in the views.
const isoDate = (value, fallback) => {
    const parsed = moment(text(value, 40), ['YYYY-MM-DD', 'YYYY-MM-DD HH:mm', moment.ISO_8601], true);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : fallback;
};

const isoDateTime = (value, fallback) => {
    const parsed = moment(text(value, 40), [moment.ISO_8601, 'YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : fallback;
};

// Percentage helper — `0/0` used to render a literal "NaN%" on the dashboard.
const percentage = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

const riskLevelFromScore = (score) => (score >= 15 ? 'High' : score >= 8 ? 'Medium' : 'Low');

// Serialises a value for embedding inside an inline <script>. `JSON.stringify`
// alone is not enough: a value containing "</script>" closes the block, and "<"
// can start a tag, so those characters are emitted as \u escapes. U+2028/U+2029
// are escaped because they terminate a line in a JavaScript string literal.
const jsonForScript = (value) => JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

// ---------------------------------------------------------------------------
// The data store keeps English keys (they are what the views compare against and
// what public/js/main.js translates). The interface is Arabic, so the display
// label is resolved through this single map instead of inline ternaries.
// ---------------------------------------------------------------------------
const AR_LABELS = {
    assetType: {
        Server: 'خادم',
        Database: 'قاعدة بيانات',
        Application: 'تطبيق',
        Network: 'معدات شبكة',
        Hardware: 'أجهزة ومعدات',
        Cloud: 'خدمة سحابية'
    },
    classification: { Critical: 'حرج', High: 'مرتفع', Medium: 'متوسط', Low: 'منخفض' },
    riskLevel: { High: 'مرتفع', Medium: 'متوسط', Low: 'منخفض' },
    status: {
        Active: 'نشط', Draft: 'مسودة', Inactive: 'غير نشط',
        Open: 'مفتوح', 'In Progress': 'قيد التنفيذ', Resolved: 'تم الحل', Closed: 'مغلق',
        Implemented: 'مطبق', 'Partially Implemented': 'مطبق جزئيًا', 'Not Implemented': 'غير مطبق',
        'Under Review': 'قيد المراجعة', Archived: 'مؤرشف',
        Completed: 'مكتمل', Scheduled: 'مجدول', Cancelled: 'ملغى'
    },
    severity: { Critical: 'حرج', High: 'مرتفع', Medium: 'متوسط', Low: 'منخفض' },
    riskCategory: {
        'Data Security': 'أمن البيانات', 'System Security': 'أمن الأنظمة',
        'Network Security': 'أمن الشبكات', 'Physical Security': 'الأمن المادي',
        'Human Factor': 'العامل البشري', Operational: 'التشغيل',
        'Legal & Compliance': 'القانون والامتثال', 'Business Continuity': 'استمرارية الأعمال'
    },
    incidentCategory: {
        'Access Control': 'التحكم بالوصول', Malware: 'البرمجيات الخبيثة',
        'Data Breach': 'خرق البيانات', 'Denial of Service': 'حجب الخدمة',
        'Social Engineering': 'الهندسة الاجتماعية', 'Physical Security': 'الأمن المادي',
        'Configuration Error': 'خطأ في الإعداد', Other: 'أخرى'
    },
    policyCategory: {
        Security: 'الأمن', 'Access Control': 'التحكم بالوصول', Operations: 'العمليات',
        'Human Resources': 'الموارد البشرية', 'Business Continuity': 'استمرارية الأعمال',
        Compliance: 'الامتثال'
    },
    controlCategory: {
        Organizational: 'تنظيمي', 'Access Control': 'التحكم بالوصول',
        'Systems Security': 'أمن الأنظمة', 'Physical Security': 'الأمن المادي',
        Compliance: 'الامتثال'
    },
    auditType: { Internal: 'داخلي', External: 'خارجي', Supplier: 'مورد' }
};

const ar = (group, value, fallback) => {
    const table = AR_LABELS[group];
    if (!table) return value;
    return table[value] || fallback || value;
};

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// In-memory data store (In production, use a proper database)
let data = {
    assets: [
        {
            id: uuidv4(),
            name: 'Web Server',
            type: 'Server',
            classification: 'High',
            owner: 'IT Department',
            location: 'Data Center A',
            riskLevel: 'Medium',
            lastAssessed: moment().subtract(30, 'days').format('YYYY-MM-DD'),
            status: 'Active'
        },
        {
            id: uuidv4(),
            name: 'Customer Database',
            type: 'Database',
            classification: 'Critical',
            owner: 'Data Protection Officer',
            location: 'Secure Cloud',
            riskLevel: 'High',
            lastAssessed: moment().subtract(15, 'days').format('YYYY-MM-DD'),
            status: 'Active'
        },
        {
            id: uuidv4(),
            name: 'Employee Laptops',
            type: 'Hardware',
            classification: 'Medium',
            owner: 'HR Department',
            location: 'Distributed',
            riskLevel: 'Medium',
            lastAssessed: moment().subtract(45, 'days').format('YYYY-MM-DD'),
            status: 'Active'
        }
    ],
    risks: [
        {
            id: uuidv4(),
            title: 'Unauthorized Data Access',
            description: 'محاولة وصول غير مصرح بها إلى قاعدة بيانات العملاء',
            category: 'Data Security',
            // probability / impact are the 1-5 scale shown in the risk matrix view.
            probability: 3,
            impact: 5,
            riskScore: 15,
            level: 'High',
            status: 'Open',
            owner: 'CISO',
            mitigation: 'تطبيق المصادقة متعددة العوامل',
            dueDate: moment().add(30, 'days').format('YYYY-MM-DD'),
            createdDate: moment().subtract(10, 'days').format('YYYY-MM-DD')
        },
        {
            id: uuidv4(),
            title: 'Phishing Attack',
            description: 'قد يقع الموظفون ضحية لرسائل البريد الإلكتروني الاحتيالية',
            category: 'Human Factor',
            probability: 4,
            impact: 3,
            riskScore: 12,
            level: 'Medium',
            status: 'In Progress',
            owner: 'Security Team',
            mitigation: 'تعزيز التدريب على التوعية الأمنية',
            dueDate: moment().add(15, 'days').format('YYYY-MM-DD'),
            createdDate: moment().subtract(20, 'days').format('YYYY-MM-DD')
        }
    ],
    incidents: [
        {
            id: uuidv4(),
            title: 'Suspicious Login Attempt',
            description: 'رُصدت محاولات تسجيل دخول فاشلة ومتكررة من موقع غير معتاد',
            severity: 'Medium',
            status: 'Resolved',
            reportedBy: 'Security Monitoring System',
            assignedTo: 'Security Team',
            reportedDate: moment().subtract(5, 'days').format('YYYY-MM-DD HH:mm'),
            resolvedDate: moment().subtract(3, 'days').format('YYYY-MM-DD HH:mm'),
            category: 'Access Control'
        },
        {
            id: uuidv4(),
            title: 'Malware Detection',
            description: 'تم اكتشاف برمجية خبيثة على أحد أجهزة الموظفين',
            severity: 'High',
            status: 'In Progress',
            reportedBy: 'Antivirus System',
            assignedTo: 'IT Security',
            reportedDate: moment().subtract(2, 'days').format('YYYY-MM-DD HH:mm'),
            resolvedDate: null,
            category: 'Malware'
        }
    ],
    policies: [
        {
            id: uuidv4(),
            title: 'Information Security Policy',
            version: '2.1',
            status: 'Active',
            approvedBy: 'CEO',
            approvedDate: moment().subtract(90, 'days').format('YYYY-MM-DD'),
            reviewDate: moment().add(275, 'days').format('YYYY-MM-DD'),
            category: 'Security',
            description: 'إطار شامل لسياسات أمن المعلومات'
        },
        {
            id: uuidv4(),
            title: 'Access Control Policy',
            version: '1.3',
            status: 'Active',
            approvedBy: 'CISO',
            approvedDate: moment().subtract(60, 'days').format('YYYY-MM-DD'),
            reviewDate: moment().add(305, 'days').format('YYYY-MM-DD'),
            category: 'Access Control',
            description: 'إجراءات إدارة وصول المستخدمين وتفويضهم'
        }
    ],
    controls: [
        {
            id: 'A.5.1.1',
            name: 'Information Security Policies',
            status: 'Implemented',
            effectiveness: 85,
            lastAssessed: moment().subtract(30, 'days').format('YYYY-MM-DD'),
            nextReview: moment().add(335, 'days').format('YYYY-MM-DD'),
            category: 'Organizational'
        },
        {
            id: 'A.9.1.1',
            name: 'Access Control Policy',
            status: 'Implemented',
            effectiveness: 92,
            lastAssessed: moment().subtract(20, 'days').format('YYYY-MM-DD'),
            nextReview: moment().add(345, 'days').format('YYYY-MM-DD'),
            category: 'Access Control'
        },
        {
            id: 'A.12.6.1',
            name: 'Management of Technical Vulnerabilities',
            status: 'Partially Implemented',
            effectiveness: 70,
            lastAssessed: moment().subtract(40, 'days').format('YYYY-MM-DD'),
            nextReview: moment().add(325, 'days').format('YYYY-MM-DD'),
            category: 'Systems Security'
        }
    ],
    audits: [
        {
            id: uuidv4(),
            title: 'Internal Security Audit Q1 2024',
            type: 'Internal',
            status: 'Completed',
            auditor: 'Internal Audit Team',
            startDate: moment().subtract(120, 'days').format('YYYY-MM-DD'),
            endDate: moment().subtract(90, 'days').format('YYYY-MM-DD'),
            findings: 3,
            recommendations: 5
        },
        {
            id: uuidv4(),
            title: 'ISO 27001 Certification Audit',
            type: 'External',
            status: 'Scheduled',
            auditor: 'External Certification Body',
            startDate: moment().add(30, 'days').format('YYYY-MM-DD'),
            endDate: moment().add(35, 'days').format('YYYY-MM-DD'),
            findings: 0,
            recommendations: 0
        }
    ]
};

// Routes

// Dashboard
app.get('/', (req, res) => {
    const implementedControls = data.controls.filter(c => c.status === 'Implemented').length;
    const dashboardData = {
        totalAssets: data.assets.length,
        activeRisks: data.risks.filter(r => r.status !== 'Closed').length,
        openIncidents: data.incidents.filter(i => i.status !== 'Resolved').length,
        activePolicies: data.policies.filter(p => p.status === 'Active').length,
        implementedControls,
        totalControls: data.controls.length,
        controlsCompliance: percentage(implementedControls, data.controls.length),
        controlStatusBreakdown: {
            implemented: implementedControls,
            partial: data.controls.filter(c => c.status === 'Partially Implemented').length,
            notImplemented: data.controls.filter(c => c.status === 'Not Implemented').length
        },
        upcomingAudits: data.audits.filter(a => a.status === 'Scheduled').length,
        riskDistribution: {
            high: data.risks.filter(r => r.riskScore >= 15).length,
            medium: data.risks.filter(r => r.riskScore >= 8 && r.riskScore < 15).length,
            low: data.risks.filter(r => r.riskScore < 8).length
        },
        assetClassification: {
            critical: data.assets.filter(a => a.classification === 'Critical').length,
            high: data.assets.filter(a => a.classification === 'High').length,
            medium: data.assets.filter(a => a.classification === 'Medium').length,
            low: data.assets.filter(a => a.classification === 'Low').length
        },
        // Average effectiveness per control category. The dashboard used to show
        // four hard-coded progress bars (85/70/92/88) that never changed.
        complianceByCategory: Object.entries(data.controls.reduce((acc, c) => {
            (acc[c.category] = acc[c.category] || []).push(c.effectiveness);
            return acc;
        }, {})).map(([category, values]) => ({
            category,
            label: AR_LABELS.controlCategory[category] || category,
            value: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
        })),
        recentIncidents: [...data.incidents].sort((a, b) => b.reportedDate.localeCompare(a.reportedDate)).slice(0, 5),
        recentRisks: [...data.risks].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5)
    };

    res.render('dashboard', { data: dashboardData, moment, ar, AR_LABELS });
});

// Asset Management
app.get('/assets', (req, res) => {
    res.render('assets', { assets: data.assets, moment, ar });
});

app.post('/assets', limiter, (req, res) => {
    const newAsset = {
        id: uuidv4(),
        name: text(req.body.name, 120),
        type: oneOf(req.body.type, ['Server', 'Database', 'Hardware', 'Network', 'Application', 'Cloud'], 'Server'),
        // The views colour badges from these English keys, so they must be stored
        // as English keys — the form options are the source of truth.
        classification: oneOf(req.body.classification, ['Critical', 'High', 'Medium', 'Low'], 'Medium'),
        owner: text(req.body.owner, 120) || 'Unassigned',
        location: text(req.body.location, 120) || 'Unspecified',
        riskLevel: oneOf(req.body.riskLevel, ['High', 'Medium', 'Low'], 'Medium'),
        lastAssessed: moment().format('YYYY-MM-DD'),
        status: 'Active'
    };
    data.assets.push(newAsset);
    res.redirect('/assets');
});

// Risk Management
// 1-5 scale labels for the risk matrix, shared by the table and the edit form.
const RISK_SCALE_LABELS = {
    1: 'منخفض جدًا',
    2: 'منخفض',
    3: 'متوسط',
    4: 'مرتفع',
    5: 'مرتفع جدًا'
};
const riskScaleLabel = (value) => {
    const n = numberIn(value, 1, 5, 3);
    return `${n} - ${RISK_SCALE_LABELS[n]}`;
};

app.get('/risks', (req, res) => {
    res.render('risks', { risks: data.risks, moment, ar, riskScaleLabel, RISK_SCALE_LABELS });
});

app.post('/risks', limiter, (req, res) => {
    // Clamped to the 1-5 scale used by the risk matrix: an empty or non-numeric
    // select used to produce `NaN * NaN` and a "NaN" badge on the page.
    const probability = numberIn(req.body.probability, 1, 5, 3);
    const impact = numberIn(req.body.impact, 1, 5, 3);
    const riskScore = probability * impact;

    const newRisk = {
        id: uuidv4(),
        title: text(req.body.title, 150),
        description: text(req.body.description, 1000),
        category: oneOf(req.body.category, [
            'Data Security', 'System Security', 'Network Security', 'Physical Security',
            'Human Factor', 'Operational', 'Legal & Compliance', 'Business Continuity'
        ], 'Operational'),
        probability,
        impact,
        riskScore,
        level: riskLevelFromScore(riskScore),
        status: 'Open',
        owner: text(req.body.owner, 120) || 'Unassigned',
        mitigation: text(req.body.mitigation, 1000),
        dueDate: isoDate(req.body.dueDate, moment().add(30, 'days').format('YYYY-MM-DD')),
        createdDate: moment().format('YYYY-MM-DD')
    };
    data.risks.push(newRisk);
    res.redirect('/risks');
});

// Incident Management
app.get('/incidents', (req, res) => {
    res.render('incidents', { incidents: data.incidents, moment, ar });
});

app.post('/incidents', limiter, (req, res) => {
    const newIncident = {
        id: uuidv4(),
        title: text(req.body.title, 150),
        description: text(req.body.description, 1000),
        severity: oneOf(req.body.severity, ['Critical', 'High', 'Medium', 'Low'], 'Medium'),
        status: 'Open',
        reportedBy: text(req.body.reportedBy, 120) || 'Unassigned',
        assignedTo: text(req.body.assignedTo, 120) || 'Unassigned',
        reportedDate: moment().format('YYYY-MM-DD HH:mm'),
        resolvedDate: null,
        category: oneOf(req.body.category, [
            'Access Control', 'Malware', 'Data Breach', 'Denial of Service',
            'Social Engineering', 'Physical Security', 'Configuration Error', 'Other'
        ], 'Other')
    };
    data.incidents.push(newIncident);
    res.redirect('/incidents');
});

// Policy Management
app.get('/policies', (req, res) => {
    res.render('policies', { policies: data.policies, moment, ar });
});

app.post('/policies', limiter, (req, res) => {
    data.policies.push({
        id: uuidv4(),
        title: text(req.body.title, 150),
        version: text(req.body.version, 20) || '1.0',
        status: oneOf(req.body.status, ['Active', 'Draft', 'Under Review', 'Archived'], 'Draft'),
        approvedBy: text(req.body.approvedBy, 120) || 'Pending',
        approvedDate: isoDate(req.body.approvedDate, moment().format('YYYY-MM-DD')),
        reviewDate: isoDate(req.body.reviewDate, moment().add(365, 'days').format('YYYY-MM-DD')),
        category: oneOf(req.body.category, [
            'Security', 'Access Control', 'Operations', 'Human Resources',
            'Business Continuity', 'Compliance'
        ], 'Security'),
        description: text(req.body.description, 1000)
    });
    res.redirect('/policies');
});

// Controls Management
app.get('/controls', (req, res) => {
    res.render('controls', { controls: data.controls, moment, ar });
});

app.post('/controls', limiter, (req, res) => {
    data.controls.push({
        id: text(req.body.id, 20) || `A.${data.controls.length + 1}.1.1`,
        name: text(req.body.name, 150),
        status: oneOf(req.body.status, ['Implemented', 'Partially Implemented', 'Not Implemented'], 'Not Implemented'),
        effectiveness: numberIn(req.body.effectiveness, 0, 100, 0),
        lastAssessed: isoDate(req.body.lastAssessed, moment().format('YYYY-MM-DD')),
        nextReview: isoDate(req.body.nextReview, moment().add(365, 'days').format('YYYY-MM-DD')),
        category: oneOf(req.body.category, [
            'Organizational', 'Access Control', 'Systems Security', 'Physical Security', 'Compliance'
        ], 'Organizational')
    });
    res.redirect('/controls');
});

// Audit Management
app.get('/audits', (req, res) => {
    res.render('audits', { audits: data.audits, moment, ar });
});

app.post('/audits', limiter, (req, res) => {
    const startDate = isoDate(req.body.startDate, moment().format('YYYY-MM-DD'));
    const endDate = isoDate(req.body.endDate, moment().add(5, 'days').format('YYYY-MM-DD'));

    data.audits.push({
        id: uuidv4(),
        title: text(req.body.title, 150),
        type: oneOf(req.body.type, ['Internal', 'External', 'Supplier'], 'Internal'),
        status: oneOf(req.body.status, ['Scheduled', 'In Progress', 'Completed', 'Cancelled'], 'Scheduled'),
        auditor: text(req.body.auditor, 120) || 'Unassigned',
        // An audit cannot end before it starts.
        startDate,
        endDate: endDate < startDate ? startDate : endDate,
        findings: numberIn(req.body.findings, 0, 100000, 0),
        recommendations: numberIn(req.body.recommendations, 0, 100000, 0)
    });
    res.redirect('/audits');
});

// Reports
app.get('/reports', (req, res) => {
    const implementedControls = data.controls.filter(c => c.status === 'Implemented').length;
    const overallEffectiveness = data.controls.length
        ? Math.round(data.controls.reduce((sum, c) => sum + c.effectiveness, 0) / data.controls.length)
        : 0;

    // The four charts in reports.ejs were previously hard-coded literals, so the
    // report could never reflect the data store. Everything below is derived.
    const byMonth = (items, dateOf) => {
        const months = [];
        for (let i = 5; i >= 0; i -= 1) {
            const anchor = moment().subtract(i, 'months');
            months.push({
                key: anchor.format('YYYY-MM'),
                label: anchor.format('MMM'),
                items: items.filter(item => moment(dateOf(item), 'YYYY-MM-DD HH:mm').isValid()
                    && moment(dateOf(item), 'YYYY-MM-DD HH:mm').format('YYYY-MM') === anchor.format('YYYY-MM'))
            });
        }
        return months;
    };

    const riskMonths = byMonth(data.risks, r => r.createdDate);
    const incidentMonths = byMonth(data.incidents, i => i.reportedDate);
    const severityRank = { Critical: 4, High: 3, Medium: 2, Low: 1 };

    const reportData = {
        kpis: {
            totalRisks: data.risks.length,
            openRisks: data.risks.filter(r => r.status !== 'Closed').length,
            totalIncidents: data.incidents.length,
            openIncidents: data.incidents.filter(i => i.status !== 'Resolved').length,
            totalAssets: data.assets.length,
            controlsCompliance: percentage(implementedControls, data.controls.length),
            overallEffectiveness,
            policyCoverage: percentage(data.policies.filter(p => p.status === 'Active').length, data.policies.length)
        },
        // Chart labels are resolved here, not in the browser: `ar()` is a
        // server-side function and does not exist in the page's <script>.
        riskTrends: riskMonths.map(month => ({
            label: month.label,
            count: month.items.length,
            averageScore: month.items.length
                ? Math.round(month.items.reduce((sum, r) => sum + r.riskScore, 0) / month.items.length)
                : 0
        })),
        incidentTrends: incidentMonths.map(month => ({
            label: month.label,
            count: month.items.length,
            highSeverity: month.items.filter(i => (severityRank[i.severity] || 0) >= 3).length
        })),
        controlEffectiveness: data.controls.map(c => ({
            name: c.name,
            effectiveness: c.effectiveness,
            category: c.category,
            categoryLabel: ar('controlCategory', c.category)
        })),
        incidentByCategory: Object.entries(data.incidents.reduce((acc, i) => {
            acc[i.category] = (acc[i.category] || 0) + 1;
            return acc;
        }, {})).map(([key, value]) => ({
            label: ar('incidentCategory', key),
            value
        })),
        riskByCategory: Object.entries(data.risks.reduce((acc, r) => {
            acc[r.category] = (acc[r.category] || 0) + 1;
            return acc;
        }, {})).map(([key, value]) => ({
            label: ar('riskCategory', key),
            value
        }))
    };
    res.render('reports', { data: reportData, moment, json: jsonForScript });
});

// API Endpoints for AJAX requests
app.get('/api/dashboard-stats', limiter, (req, res) => {
    res.json({
        totalAssets: data.assets.length,
        activeRisks: data.risks.filter(r => r.status !== 'Closed').length,
        openIncidents: data.incidents.filter(i => i.status !== 'Resolved').length,
        controlsCompliance: percentage(
            data.controls.filter(c => c.status === 'Implemented').length,
            data.controls.length
        )
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        message: 'حدث خطأ غير متوقع في الخادم. يرجى المحاولة مرة أخرى.',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        message: 'الصفحة المطلوبة غير موجودة.',
        error: {}
    });
});

app.listen(PORT, () => {
    console.log(`ISO 27001 ISMS Dashboard running on port ${PORT}`);
    console.log(`Open your browser and navigate to: http://localhost:${PORT}`);
});
