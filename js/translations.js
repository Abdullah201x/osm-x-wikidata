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
    chipHideLinked: "🟢 إخفاء المرتبط",

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
    // Batch & Multi-Item Changesets
    batchQueueTitle: "سلة التعديلات المجمعة",
    batchQueueBtn: "سلة التعديلات",
    btnAddToBatch: "➕ إضافة للمجموعة",
    btnInBatch: "✓ مضاف للمجموعة",
    btnRemoveFromBatch: "إزالة من المجموعة",
    btnBatchUpload: "🚀 رفع ونشر مجموعة التعديل",
    btnClearBatch: "تفريغ السلة",
    batchEmptyTitle: "سلة التعديلات فارغة",
    batchEmptyDesc: "اختر أي عنصر مرشح واضغط 'إضافة للمجموعة' لتجميع عدة معالم ونشرها في مجموعة تعديل (Changeset) واحدة وفق معايير مجتمع OSM.",
    batchModalTitle: "مجموعة التعديل المجمعة (Batch Changeset)",
    batchStagedItemsCount: "العناصر المجهزة للربط:",
    batchSuccessTitle: "تم رفع مجموعة التعديل بنجاح!",
    batchSuccessMessage: "تم تحديث جميع العناصر بنجاح تحت مجموعة تعديل واحدة في خوادم OpenStreetMap.",
    viewChangesetInHistory: "عرض في سجل التعديلات",
    linkSingleNow: "⚡ ربط فوري (مفرد)",
    singleLinkTitle: "مراجعة وتأكيد الربط الفردي",
    singleLinkDesc: "إنشاء مجموعة تعديل مستقلة لهذا المعلم وتحديث وسومه في خوادم OpenStreetMap.",
    btnConfirmLinkNow: "🚀 تأكيد ونشر التعديل",
    
    // Improved Changeset Comments & Presets
    changesetCommentLabel: "تعليق مجموعة التعديل (Changeset Comment):",
    changesetCommentHelp: "تعليق وصفي وواضح يوضح ما تم تعديله لمجتمع الخريطة وفريق البيانات.",
    quickInsertPresets: "إضافات سريعة للتعليق:",
    presetAerial: "تم التحقق بالصور الجوية (Esri)",
    presetNameMatch: "مطابقة أسماء مؤكدة",
    presetGround: "معرفة محلية على الواقع",

    // History & What has been done Page
    historyPageTitle: "سجل التعديلات والإنجازات",
    historyPageSubtitle: "جميع مجموعات التعديل والعناصر التي تم ربطها ونشرها في OpenStreetMap عبر الأداة",
    historySearchPlaceholder: "بحث في السجل بالاسم، رمز QID، رقم العنصر، أو رقم المجموعة...",
    historyFilterAll: "الكل",
    historyFilterBatch: "مجموعات مجمعة",
    historyFilterSingle: "تعديلات مفردة",
    statTotalChangesets: "إجمالي مجموعات التعديل",
    statTotalLinkedItems: "إجمالي المعالم المرتبطة",
    statBatchChangesets: "مجموعات مجمعة",
    statSingleChangesets: "تعديلات مفردة",
    btnExportCsv: "📥 تصدير CSV",
    btnExportJson: "📥 تصدير JSON",
    btnClearHistory: "🗑️ تفريغ السجل",
    confirmClearHistory: "هل أنت متأكد من تفريغ سجل التعديلات المحلي؟ لن يؤثر ذلك على التعديلات المنشورة في OSM.",
    historyEmptyTitle: "لم يتم تسجيل أي تعديلات حتى الآن",
    historyEmptyDesc: "عند قيامك بربط أي معالم (سواء فردياً أو عبر سلة التعديلات)، ستظهر جميع مجموعات التعديل هنا مع تفاصيلها وروابطها الرسمية في OSM.",
    btnShowOnMap: "عرض على الخريطة",
    shortcutBatch: "فتح سلة التعديلات المجمعة",
    shortcutHistory: "فتح سجل الإنجازات والتعديلات",
    shortcutDirectLink: "ربط مباشر بـ OSM",

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
    chipHideLinked: "🟢 Hide Linked",

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

    // Batch & Multi-Item Changesets
    batchQueueTitle: "Changeset Batch Queue",
    batchQueueBtn: "Changeset Batch",
    btnAddToBatch: "➕ Add to Batch",
    btnInBatch: "✓ In Batch",
    btnRemoveFromBatch: "Remove from Batch",
    btnBatchUpload: "🚀 Upload & Commit Changeset",
    btnClearBatch: "Clear Batch",
    batchEmptyTitle: "Batch Queue is Empty",
    batchEmptyDesc: "Select any candidate feature and click 'Add to Batch' to stage multiple edits and upload them together in a single, well-documented OSM Changeset.",
    batchModalTitle: "Changeset Batch Staging Queue",
    batchStagedItemsCount: "Staged Features:",
    batchSuccessTitle: "Changeset Uploaded Successfully!",
    batchSuccessMessage: "All staged items have been linked within a single changeset on OpenStreetMap.",
    viewChangesetInHistory: "View in History",
    linkSingleNow: "⚡ Link Now (Single)",
    singleLinkTitle: "Confirm Single OSM Link",
    singleLinkDesc: "Create an individual changeset for this item and update its tags on OpenStreetMap servers.",
    btnConfirmLinkNow: "🚀 Confirm & Upload Changeset",
    
    // Improved Changeset Comments & Presets
    changesetCommentLabel: "Changeset Comment:",
    changesetCommentHelp: "Informative, descriptive summary for the OSM mapping community and Data Working Group.",
    quickInsertPresets: "Quick Comment Presets:",
    presetAerial: "Verified with aerial imagery (Esri)",
    presetNameMatch: "Name match confirmed",
    presetGround: "Ground truth / local knowledge",

    // History & What has been done Page
    historyPageTitle: "Changeset History & Activity Log",
    historyPageSubtitle: "All OpenStreetMap changesets and feature links created through this tool",
    historySearchPlaceholder: "Search history by feature name, QID, OSM ID, or Changeset ID...",
    historyFilterAll: "All",
    historyFilterBatch: "Batch Changesets",
    historyFilterSingle: "Single Edits",
    statTotalChangesets: "Total Changesets",
    statTotalLinkedItems: "Total Linked Features",
    statBatchChangesets: "Batch Changesets",
    statSingleChangesets: "Single Edits",
    btnExportCsv: "📥 Export CSV",
    btnExportJson: "📥 Export JSON",
    btnClearHistory: "🗑️ Clear History",
    confirmClearHistory: "Are you sure you want to clear your local changeset history? This will not affect edits on OSM.",
    historyEmptyTitle: "No Changesets Recorded Yet",
    historyEmptyDesc: "When you link features (either individually or via the batch queue), all changesets will appear here with official OSM links.",
    btnShowOnMap: "Show on Map",
    shortcutBatch: "Open Changeset Batch Queue",
    shortcutHistory: "Open Changeset History",

    footerText: 'Data from <a href="https://www.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> & <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> · Saudi OSM Community: <a href="https://t.me/OSMSaudi" target="_blank" rel="noopener">Telegram</a>'
  }
};

