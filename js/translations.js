/**
 * Bilingual UI Translations (Arabic default, English toggle)
 * Matching GCC OSM community conventions.
 */
const TRANSLATIONS = {
  ar: {
    langLabel: "English",
    docTitle: "ربط أوبن ستريت ماب وويكي بيانات لدول الخليج",
    mainTitle: "ربط OSM × ويكي بيانات",
    subtitle: "أداة متقدمة لربط بيانات OpenStreetMap بـ Wikidata، وكشف العناصر المفقودة في OSM لدول الخليج العربي.",
    
    // Stats & Filters
    statTotal: "إجمالي العناصر",
    statMissing: "مفقود في OSM",
    statCandidates: "تطابق مرشح",
    statLinked: "مرتبط مسبقاً",
    
    filterCountry: "الدولة",
    filterStatus: "حالة الربط",
    filterCategory: "التصنيف",
    searchPlaceholder: "بحث بالاسم العربي أو الإنجليزي أو رمز QID...",
    
    statusAll: "الكل",
    statusMissing: "مفقود في OSM (🔴 للرسم)",
    statusCandidates: "تطابق مرشح (🟡 للربط)",
    statusLinked: "مرتبط (🟢 مكتمل)",

    // Categories
    catPlaces: "المدن والتجمعات السكنية",
    catHeritage: "التراث والآثار والتاريخ",
    catNature: "الجغرافيا والمعالم الطبيعية",
    catAmenity: "التعليم والصحة والخدمات",
    catTourism: "السياحة والمراكز التجارية",
    catWorship: "المساجد ودور العبادة",
    toggleMosquesNotice: "المساجد تشكل النسبة الأكبر؛ يمكنك إخفاؤها للتركيز على المعالم الأخرى.",

    // Basemaps
    bmDark: "داكن (افتراضي)",
    bmSatellite: "قمر صناعي (Esri)",
    bmStreets: "شوارع OSM",
    
    // Inspector & Actions
    inspectorTitle: "لوحة الفحص والمعاينة المتقدمة",
    inspectorEmpty: "انقر على أي عنصر على الخريطة لعرض تفاصيله وأدوات الربط والرسم.",
    wdSection: "بيانات ويكي بيانات (Wikidata)",
    osmSection: "حالة العنصر في OpenStreetMap",
    
    labelQid: "رمز ويكي بيانات:",
    labelNameAr: "الاسم العربي:",
    labelNameEn: "الاسم الإنجليزي:",
    labelP31: "النوع (P31):",
    labelCoords: "الإحداثيات:",
    labelWikipedia: "مقال ويكيبيديا",
    labelCommons: "صورة كومنز",
    
    tagProposalTitle: "الوسوم المقترحة للإضافة إلى OSM:",
    btnCopyTags: "نسخ الوسوم للحافظة",
    btnCopied: "تم النسخ!",
    btnCopyXml: "نسخ كود XML لـ JOSM",
    btnLiveVerify: "التحقق المباشر في OSM الآن",
    liveVerifying: "جارٍ فحص خوادم OSM...",
    liveFound: "تم رسمه في OSM حديثاً!",
    liveNotFound: "غير موجود حتى الآن على خريطة OSM الحية.",
    
    // Tools
    btnJosmZoom: "فتح وتكبير في JOSM",
    btnJosmAddTags: "إرسال الوسم لـ JOSM",
    btnJosmAddNode: "إنشاء نقطة جديدة في JOSM",
    btnEditId: "تعديل في محرر iD",
    btnAddNote: "إضافة ملاحظة OSM",
    btnQuickStatements: "تصدير QuickStatements",
    btnExportMapRoulette: "تصدير تحدي MapRoulette (GeoJSON)",
    btnExportCsv: "تصدير CSV",
    btnExportJosmPresets: "📥 قوالب JOSM (XML)",
    btnOverpassTurbo: "⚡ فحص في Overpass Turbo",
    researchTitle: "التحقق والبحث الخارجي:",
    searchGoogle: "بحث Google",
    searchWikipedia: "ويكيبيديا",
    searchWikidata: "ويكي بيانات",
    dissolvedWarning: "⚠️ هذا المعلم مُلغى أو مهدم بحسب ويكي بيانات",
    contactWebsite: "الموقع الرسمي:",
    socialLinks: "حسابات التواصل:",
    
    josmError: "تعذر الاتصال ببرنامج JOSM. تأكد أن JOSM مفتوح ومفعل فيه التحكم عن بعد (Remote Control) في تفضيلات البرنامج (المنفذ 8111).",
    
    // OSM OAuth & Notes
    loginOsm: "تسجيل الدخول بـ OSM",
    logoutOsm: "تسجيل خروج",
    loggedInAs: "متصل كـ:",
    noteModalTitle: "إرسال ملاحظة إلى OpenStreetMap",
    noteTextPlaceholder: "اكتب تفاصيل الملاحظة هنا (مثال: هذا المعلم موجود على أرض الواقع باسم ...)",
    btnSubmitNote: "إرسال الملاحظة",
    btnCancel: "إلغاء",
    noteSuccess: "تم إرسال الملاحظة بنجاح إلى OpenStreetMap!",

    // Viewport Stats
    toggleViewportStats: "نطاق الرؤية الحالي",
    inViewSuffix: "في العرض",
    viewportStatsActive: "إحصائيات مجال الرؤية مفعلة",

    // Quality Filter Chips
    chipHasWiki: "📖 مقال ويكيبيديا",
    chipHasPhoto: "📷 صورة كومنز",
    chipHideDemolished: "🚫 إخفاء المهدم/السابق",
    chipHideMosques: "🕌 إخفاء المساجد",

    // Multi Candidates
    candidateFoundMulti: "عناصر مرشحة قريبة في OSM:",
    btnLinkThisCandidate: "ربط بهذا العنصر",
    distanceMeters: "متر",
    clearCandidates: "مسح المعاينة",
    noCandidatesFound: "لم يتم العثور على عناصر قريبة متطابقة.",

    // Shortcuts
    btnShortcutsHelp: "اختصارات المفاتيح ⌨️",
    shortcutsTitle: "اختصارات لوحة المفاتيح للمحررين",
    shortcutJosmZoom: "فتح وتكبير في JOSM",
    shortcutJosmTags: "إرسال الوسم إلى JOSM",
    shortcutId: "فتح في محرر iD",
    shortcutVerify: "التحقق المباشر في خوادم OSM",
    shortcutNext: "الانتقال للمعلم التالي",
    shortcutPrev: "الانتقال للمعلم السابق",
    shortcutBasemap: "تبديل خريطة الأساس",
    shortcutHelp: "عرض نافذة الاختصارات",

    // Direct 1-Click OSM Linking
    btnDirectLinkOsm: "🔗 ربط بـ OSM مباشرة",
    linkingInProgress: "جارٍ تحديث وسوم المعلم في خوادم OpenStreetMap...",
    linkSuccess: "تم ربط المعلم بنجاح في OpenStreetMap! رقم مجموعة التعديل:",
    linkError: "تعذر ربط المعلم:",
    needLoginToLink: "يرجى تسجيل الدخول بحسابك في OpenStreetMap أولاً لتنفيذ التعديل باسمك.",
    confirmLinkPrompt: "هل تؤكد إضافة وسم {qid} إلى عنصر OSM ({osmRef})؟",
    openChangeset: "عرض التعديل في OSM ↗",
    alreadyLinkedNotice: "هذا العنصر مرتبط بـ Wikidata مسبقاً بنفس الرمز!",
    // Maintainer & DWG Contact
    maintainerLabel: "المطور:",
    contactOsmMsg: "رسالة OSM",
    policyLabel: "السياسات وDWG",
    aboutModalTitle: "حول المشروع، التواصل، وسياسات فريق البيانات (DWG)",
    aboutLead: "أداة مساعدة لمجتمع OpenStreetMap لدول الخليج لربط المعالم القائمة بمعرفات Wikidata المقابلة لها (Assisted Conflation).",
    aboutContactHeading: "قنوات التواصل والمطور:",
    aboutSendMsg: "إرسال رسالة مباشرة على OSM ↗",
    dwgHeading: "التزام سياسة المجتمع وفريق العمل (DWG Compliance):",
    dwgText: "نحن نحترم قواعد OpenStreetMap وفريق البيانات (DWG) بشكل تام. هذه الأداة لا تقوم بأي تعديلات آلية غير مراقبة. جميع التعديلات تتطلب تسجيل دخول المستخدم، وتتم على عناصر قائمة تم التحقق منها بشرياً، وتخضع للمراجعة الكاملة. إذا كان لديك أي ملاحظات أو كنت عضواً في مجتمع الخريطة أو فريق DWG ولديك أي استفسار أو اعتراض، يرجى التواصل مباشرة عبر الرسائل أو GitHub وسنتعاون فوراً.",

    footerText: 'بيانات <a href="https://www.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> و <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> · مجتمع OSM السعودي: <a href="https://t.me/OSMSaudi" target="_blank" rel="noopener">تيليجرام</a>'
  },
  en: {
    langLabel: "العربية",
    docTitle: "OSM x Wikidata Linker for GCC Countries",
    mainTitle: "OSM × Wikidata GCC Linker",
    subtitle: "Power-user tool to link OpenStreetMap with Wikidata and find missing geographic entities across the GCC.",
    
    // Stats & Filters
    statTotal: "Total Items",
    statMissing: "Missing in OSM",
    statCandidates: "Candidate Matches",
    statLinked: "Already Linked",
    
    filterCountry: "Country",
    filterStatus: "Link Status",
    filterCategory: "Category",
    searchPlaceholder: "Search by Arabic, English name or QID...",
    
    statusAll: "All Statuses",
    statusMissing: "Missing in OSM (🔴 To Map)",
    statusCandidates: "Candidate Match (🟡 To Link)",
    statusLinked: "Linked (🟢 Completed)",

    // Categories
    catPlaces: "Places & Settlements",
    catHeritage: "Heritage & History",
    catNature: "Geography & Nature",
    catAmenity: "Healthcare & Education",
    catTourism: "Tourism & Commercial",
    catWorship: "Places of Worship",
    toggleMosquesNotice: "Mosques represent the vast majority; you can toggle them off to focus on other infrastructure.",

    // Basemaps
    bmDark: "Dark Mode (Default)",
    bmSatellite: "Satellite (Esri Imagery)",
    bmStreets: "OSM Standard",
    
    // Inspector & Actions
    inspectorTitle: "Advanced Inspection Workbench",
    inspectorEmpty: "Click any feature on the map to inspect details, tag presets, and mapping tools.",
    wdSection: "Wikidata Entity Information",
    osmSection: "OpenStreetMap Status & Matching",
    
    labelQid: "Wikidata QID:",
    labelNameAr: "Arabic Name:",
    labelNameEn: "English Name:",
    labelP31: "Instance Of (P31):",
    labelCoords: "Coordinates:",
    labelWikipedia: "Wikipedia Article",
    labelCommons: "Commons Photo",
    
    tagProposalTitle: "Suggested OSM Tags to Add:",
    btnCopyTags: "Copy Tags to Clipboard",
    btnCopied: "Copied!",
    btnCopyXml: "Copy OSM XML for JOSM",
    btnLiveVerify: "Verify Live in OSM Now",
    liveVerifying: "Checking live OSM servers...",
    liveFound: "Mapped live in OSM!",
    liveNotFound: "Not found on live OSM map yet.",
    
    // Tools
    btnJosmZoom: "Load & Zoom in JOSM",
    btnJosmAddTags: "Push Tag to JOSM Selection",
    btnJosmAddNode: "Create New Node in JOSM",
    btnEditId: "Edit in iD Editor",
    btnAddNote: "Add OSM Note",
    btnQuickStatements: "QuickStatements Export",
    btnExportMapRoulette: "Export MapRoulette Challenge",
    btnExportCsv: "Export CSV",
    btnExportJosmPresets: "📥 JOSM Presets (XML)",
    btnOverpassTurbo: "⚡ Overpass Turbo Query",
    researchTitle: "External Research:",
    searchGoogle: "Google Search",
    searchWikipedia: "Wikipedia",
    searchWikidata: "Wikidata",
    dissolvedWarning: "⚠️ This feature is dissolved or demolished per Wikidata",
    contactWebsite: "Official Website:",
    socialLinks: "Social Identities:",
    
    josmError: "Failed to connect to JOSM. Please ensure JOSM is running with Remote Control enabled in Preferences (port 8111).",
    
    // OSM OAuth & Notes
    loginOsm: "Login with OSM",
    logoutOsm: "Logout",
    loggedInAs: "Logged in as:",
    noteModalTitle: "Submit OpenStreetMap Note",
    noteTextPlaceholder: "Enter note details (e.g. This landmark physically exists as ...)",
    btnSubmitNote: "Submit Note",
    btnCancel: "Cancel",
    noteSuccess: "Note successfully submitted to OpenStreetMap!",

    // Viewport Stats
    toggleViewportStats: "Current Viewport Only",
    inViewSuffix: "in view",
    viewportStatsActive: "Viewport stats active",

    // Quality Filter Chips
    chipHasWiki: "📖 Has Wikipedia",
    chipHasPhoto: "📷 Has Photo",
    chipHideDemolished: "🚫 Hide Demolished",
    chipHideMosques: "🕌 Hide Mosques",

    // Multi Candidates
    candidateFoundMulti: "Nearby OSM Candidates Found:",
    btnLinkThisCandidate: "Link to this Object",
    distanceMeters: "m",
    clearCandidates: "Clear Preview",
    noCandidatesFound: "No matching nearby OSM objects found.",

    // Shortcuts
    btnShortcutsHelp: "Shortcuts ⌨️",
    shortcutsTitle: "Power-User Keyboard Shortcuts",
    shortcutJosmZoom: "Load & Zoom in JOSM",
    shortcutJosmTags: "Push Tag to JOSM",
    shortcutId: "Edit in iD Editor",
    shortcutVerify: "Live Overpass Verify",
    shortcutNext: "Next POI in List",
    shortcutPrev: "Previous POI in List",
    shortcutBasemap: "Cycle Basemap (Dark/Sat/Streets)",
    shortcutHelp: "Show Shortcuts Cheatsheet",

    // Direct 1-Click OSM Linking
    btnDirectLinkOsm: "🔗 Link in OSM Directly",
    linkingInProgress: "Updating tags on OpenStreetMap servers...",
    linkSuccess: "Successfully linked in OpenStreetMap! Changeset ID:",
    linkError: "Failed to link element:",
    needLoginToLink: "Please log in with your OpenStreetMap account first to submit edits under your name.",
    confirmLinkPrompt: "Confirm adding tag {qid} to OSM element ({osmRef})?",
    openChangeset: "View Changeset in OSM ↗",
    alreadyLinkedNotice: "This OSM element is already linked with this Wikidata QID!",
    shortcutDirectLink: "Direct Link in OSM",

    // Maintainer & DWG Contact
    maintainerLabel: "Maintainer:",
    contactOsmMsg: "OSM Message",
    policyLabel: "Policies & DWG",
    aboutModalTitle: "About the Project, Contact & DWG Compliance",
    aboutLead: "An assisted conflation workbench for the GCC OpenStreetMap community to accurately link existing features to corresponding Wikidata entities.",
    aboutContactHeading: "Contact Channels & Maintainer:",
    aboutSendMsg: "Send direct message on OSM ↗",
    dwgHeading: "Community & DWG Compliance Statement:",
    dwgText: "We strictly respect OpenStreetMap guidelines and the Data Working Group (DWG). This tool executes NO automated or unattended mass edits. Every change requires an authenticated user, manual review against imagery, and explicit consent. If you are a mapper, community member, or DWG representative with feedback or concerns, please contact the maintainer directly via OSM messaging or GitHub and we will promptly address it.",

    footerText: 'Data from <a href="https://www.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> & <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> · Saudi OSM Community: <a href="https://t.me/OSMSaudi" target="_blank" rel="noopener">Telegram</a>'
  }
};

