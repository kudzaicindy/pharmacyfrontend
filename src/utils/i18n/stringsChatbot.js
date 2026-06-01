/**
 * MediBot / chatbot UI strings (EN / SN / ND).
 */

export const CHAT_ACTION = {
  USE_MY_LOCATION: 'use_my_location',
  ENTER_MANUALLY: 'enter_manually',
  YES_SEARCH_MEDICINES: 'yes_search_medicines',
  NO_DESCRIBE_DIFFERENTLY: 'no_describe_differently',
  CONFIRM_PRESCRIPTION: 'confirm_prescription',
  EDIT_MANUALLY: 'edit_manually',
  SEND_RX_TO_PHARMACIES: 'send_rx_to_pharmacies',
}

export const CHATBOT_STRINGS = {
  'header.title': {
    EN: 'MediBot — AI Health Assistant',
    SN: 'MediBot — Mubatsiri weUtano neAI',
    ND: 'MediBot — Umsizi weMpilo we-AI',
  },
  'header.status': {
    EN: 'Online · Responds instantly',
    SN: 'Pamhepo · Anopindura nekukurumidza',
    ND: 'Ku-inthanethi · Uphendula ngokushesha',
  },
  'header.newChat': { EN: 'New chat', SN: 'Hurukuro itsva', ND: 'Ingxoxo entsha' },
  'header.language': { EN: 'Language', SN: 'Mutauro', ND: 'Ulimi' },
  'sender.bot': { EN: 'MediBot', SN: 'MediBot', ND: 'MediBot' },
  'sender.you': { EN: 'You', SN: 'Iwe', ND: 'Wena' },

  'greeting.initial': {
    EN: 'Hi — I can help you find medicine: search by name, describe symptoms, or upload a prescription. What do you need?',
    SN: 'Mhoro — ndinogona kukubatsira kutsvaga mushonga: tsvaga nezita, rondedzera zviratidzo, kana kuisa chirevo chemushonga. Unoda chii?',
    ND: 'Sawubona — ngingakusiza ukuthola umuthi: sesha ngegama, chaza izimpawu, noma layisha isiqinisekiso somuthi. Ufunani?',
  },
  'greeting.welcomeBack': {
    EN: 'Welcome back — here is your last search. Use **Get directions** below, or open **My pickup** from the home page anytime.',
    SN: 'Mauya zvakare — henyu kutsvaga kwakapfuura. Shandisa **Tora nzira** pazasi, kana vhura **Kutora kwangu** kubva papeji rekutanga chero nguva.',
    ND: 'Uyemukelile futhi — nansi ukusesha kwakho kokugcina. Sebenzisa **Thola indlela** ngezansi, noma vula **Ukuthatha kwami** ekhasini lasekhaya noma nini.',
  },
  'greeting.newChat': {
    EN: 'New chat started. How can I help? Search for medicine, describe symptoms, or upload a prescription.',
    SN: 'Hurukuro itsva yatanga. Ndingakubatsira sei? Tsvaga mushonga, rondedzera zviratidzo, kana kuisa chirevo.',
    ND: 'Ingxoxo entsha iqalile. Ngingakusiza kanjani? Sesha umuthi, chaza izimpawu, noma layisha isiqinisekiso.',
  },

  'placeholder.default': {
    EN: 'Ask about medicine, symptoms, or upload a prescription...',
    SN: 'Bvunza nezvemushonga, zviratidzo, kana kuisa chirevo...',
    ND: 'Buza ngomuthi, izimpawu, noma layisha isiqinisekiso...',
  },
  'placeholder.location': {
    EN: 'Enter your location...',
    SN: 'Nyora nzvimbo yako...',
    ND: 'Faka indawo yakho...',
  },

  'chip.uploadRx': { EN: '📸 Upload Prescription', SN: '📸 Isa Chirevo', ND: '📸 Layisha Isiqinisekiso' },
  'chip.searchMed': { EN: '🔍 Search Medicine', SN: '🔍 Tsvaga Mushonga', ND: '🔍 Sesha Umuthi' },
  'chip.symptoms': { EN: '💊 Describe Symptoms', SN: '💊 Rondedzera Zviratidzo', ND: '💊 Chaza Izimpawu' },
  'chip.nearby': { EN: '📍 Find Nearby Pharmacy', SN: '📍 Tsvaga Chemist Pedyo', ND: '📍 Thola Ipharmacy Esondele' },

  'chip.input.search': { EN: 'I need ', SN: 'Ndinoda ', ND: 'Ngidinga ' },
  'chip.input.symptom': { EN: 'I have a headache', SN: 'Ndine mutsiywa wemusoro', ND: 'Ngiyakhathaza ikhanda' },
  'chip.input.nearby': {
    EN: 'Find pharmacy near me',
    SN: 'Tsvaga chemist pedyo neni',
    ND: 'Thola ipharmacy eduze kwami',
  },
  'chip.input.symptomPrefix': { EN: 'I am having ', SN: 'Ndine ', ND: 'Ngiyazwa ' },

  'action.useMyLocation': { EN: 'Use My Location', SN: 'Shandisa Nzvimbo Yangu', ND: 'Sebenzisa Indawo Yami' },
  'action.enterManually': { EN: 'Enter Manually', SN: 'Nyora Nzvimbo', ND: 'Faka Indawo Ngesandla' },
  'action.yesSearch': {
    EN: 'Yes, search for these medicines',
    SN: 'Ehe, tsvaga aya mashonga',
    ND: 'Yebo, sesha la mithi',
  },
  'action.noDifferent': {
    EN: 'No, let me describe differently',
    SN: 'Kwete, rega ndirondedzere zvakasiyana',
    ND: 'Cha, ake ngichaze ngendlela ehlukile',
  },
  'action.confirm': { EN: 'Confirm', SN: 'Simbisa', ND: 'Qinisekisa' },
  'action.editManually': { EN: 'Edit Manually', SN: 'Gadzirisa Nemaoko', ND: 'Lungisa Ngesandla' },
  'action.sendRxToPharmacies': {
    EN: 'Send image to pharmacies',
    SN: 'Tumira mufananidzo kumachemist',
    ND: 'Thumela isithombe kumapharmacy',
  },

  'error.generic': {
    EN: 'Sorry, I encountered an error. Please try again.',
    SN: 'Pamusoroi, pane chakanganisika. Edza zvakare.',
    ND: 'Uxolo, kube nephutha. Sicela uzame futhi.',
  },
  'error.location': {
    EN: 'Sorry, I encountered an error processing your location. Please try again.',
    SN: 'Pamusoroi, pane chakanganisika pachinzvimbo yako. Edza zvakare.',
    ND: 'Uxolo, kube nephutha ekucubunguleni indawo yakho. Sicela uzame futhi.',
  },
  'error.prescription': {
    EN: "Sorry, I couldn't process your prescription. Please make sure the image is clear and try again.",
    SN: 'Pamusoroi, handina kukwanisa kubvisa chirevo chako. Ita shuwa mufananidzo wakajeka uye edza zvakare.',
    ND: 'Uxolo, angikwazanga ukucubungula isiqinisekiso sakho. Sicela isithombe sicace bese uzame futhi.',
  },
  'error.confirmRx': {
    EN: 'Could not confirm prescription. Please try again.',
    SN: 'Hatina kukwanisa kusimbisa chirevo. Edza zvakare.',
    ND: 'Ayikwazanga ukuqinisekisa isiqinisekiso. Sicela uzame futhi.',
  },

  'location.prompt': {
    EN: 'To find pharmacies near you, I need your location. Would you like me to use your current location?',
    SN: 'Kuti nditsvage machemist pedyo newe, ndinoda nzvimbo yako. Unoda kuti ndishandise nzvimbo yauri parizvino?',
    ND: 'Ukuze ngithole amapharmacy aseduze nawe, ngidinga indawo yakho. Ungathanda ngisebenzise indawo yakho yamanje?',
  },
  'location.promptShort': {
    EN: 'Would you like me to use your current location?',
    SN: 'Unoda kuti ndishandise nzvimbo yauri parizvino?',
    ND: 'Ungathanda ngisebenzise indawo yakho yamanje?',
  },
  'location.manual': {
    EN: "Please type your area or address (e.g. `4 St Kilda, Mt Pleasant`, `Avondale, Harare`, or `Mount Pleasant`). We'll also use GPS if your browser allows it.",
    SN: 'Nyora nharaunda kana kero (semuenzaniso `Avondale, Harare`). Tichashandisawo GPS kana browser yako ichibvumira.',
    ND: 'Sicela ubhale isifunda noma ikheli (isb. `Avondale, Harare`). Sizosebenzisa ne-GPS uma isiphequluli sivumela.',
  },
  'location.afterConfirm': {
    EN: 'Medicines confirmed. To find pharmacies, please share your location.',
    SN: 'Mashonga asimbiswa. Kuti nditsvage machemist, ndipe nzvimbo yako.',
    ND: 'Imithi iqinisekisiwe. Ukuze ngithole amapharmacy, sicela wabelane ngendawo yakho.',
  },
  'location.share': {
    EN: 'To find pharmacies, please share your location.',
    SN: 'Kuti nditsvage machemist, ndipe nzvimbo yako.',
    ND: 'Ukuze ngithole amapharmacy, sicela wabelane ngendawo yakho.',
  },
  'location.saved': {
    EN: 'Location saved: {label}.\n\nSearching for pharmacies near you…',
    SN: 'Nzvimbo yachengetwa: {label}.\n\nNdiri kutsvaga machemist pedyo newe…',
    ND: 'Indawo ilondoloziwe: {label}.\n\nNgiyasesha amapharmacy eduze kwakho…',
  },

  'payload.startNewSearch': { EN: 'Start new search', SN: 'Tanga kutsvaga kwitsva', ND: 'Qala ukusesha okusha' },
  'payload.useMyLocation': {
    EN: 'Use my current location',
    SN: 'Shandisa nzvimbo yandiri parizvino',
    ND: 'Sebenzisa indawo yami yamanje',
  },
  'payload.confirmRx': {
    EN: 'Confirm prescription medicines',
    SN: 'Simbisa mashonga ari muchirevo',
    ND: 'Qinisekisa imithi esiqinisekisweni',
  },
  'payload.yesSearch': {
    EN: 'Yes, please search for {meds}',
    SN: 'Ehe, ndapota tsvaga {meds}',
    ND: 'Yebo, sicela useshe {meds}',
  },

  'waiting.sent': {
    EN: 'Request has been sent. Waiting for pharmacies to respond. Responses will appear as soon as pharmacies reply.',
    SN: 'Chikumbiro chatumirwa. Tiri kumirira machemist kupindura. Mhinduro dzichabuda machemist akapindura.',
    ND: 'Isicelo sithunyelwe. Silinde amapharmacy aphendule. Izimpendulo zizovela lapho aphendula.',
  },
  'waiting.carryPrescription': {
    EN: 'Please carry your original paper prescription when you visit the pharmacy — pharmacists may need to verify it before dispensing.',
    SN: 'Ndapota takura chirevo chako chepapera paunofamba kumachemist — vanogona kuda kuona kuti vabvume kupa mashonga.',
    ND: 'Sicela uwathathe isiqinisekiso sakho sokubhala lapho uvakashela i-pharmacy — abamelaphi bangadinga ukusiqinisekisa ngaphambi kokuphatha imithi.',
  },
  'symptom.retry': {
    EN: "No problem. Please describe your symptoms again, and I'll suggest different options.",
    SN: 'Hapana dambudziko. Rondedzera zviratidzo zvakare, ndichakupa dzimwe sarudzo.',
    ND: 'Akunankinga. Sicela uchaze izimpawu futhi, ngizokunikeza ezinye izinketho.',
  },
  'manual.meds': {
    EN: 'Please type the medicine names you need (comma-separated), e.g.: Amoxicillin 500mg, Paracetamol 500mg',
    SN: 'Nyora mazita emashonga aunoda (akabatanidzwa necomma), semuenzaniso: Amoxicillin 500mg, Paracetamol 500mg',
    ND: 'Bhala amagama emithi oyidingayo (ahlukaniswe nge-comma), isb.: Amoxicillin 500mg, Paracetamol 500mg',
  },

  'rx.uploaded': { EN: '📄 Prescription uploaded: {name}', SN: '📄 Chirevo chaiswa: {name}', ND: '📄 Isiqinisekiso silayishiwe: {name}' },
  'rx.processed': { EN: "I've processed your prescription!\n\n", SN: 'Ndabvisa chirevo chako!\n\n', ND: 'Ngicubungule isiqinisekiso sakho!\n\n' },
  'rx.medicinesFound': { EN: '**Medicines found:**\n', SN: '**Mashonga awanikwa:**\n', ND: '**Imithi etholakele:**\n' },
  'rx.dosages': { EN: '**Dosages:**\n', SN: '**Mazere:**\n', ND: '**Amagesi:**\n' },
  'rx.confidence': { EN: '**Confidence:** {pct}%\n\n', SN: '**Kuvimbika:** {pct}%\n\n', ND: '**Ukuqiniseka:** {pct}%\n\n' },
  'rx.notes': { EN: '**Notes:** {notes}\n\n', SN: '**Zvinyorwa:** {notes}\n\n', ND: '**Amanothi:** {notes}\n\n' },
  'rx.lowConfidence': {
    EN: '⚠️ Low confidence (<90%). Please verify the extracted medicines are correct.\n\n',
    SN: '⚠️ Kuvimbika kuri pasi (<90%). Tarisa kuti mashonga akaburitswa ndiwo akarurama.\n\n',
    ND: '⚠️ Ukuqiniseka kuphansi (<90%). Sicela uqinisekise imithi etholiwe ilungile.\n\n',
  },
  'rx.searching': {
    EN: "I'm now searching for pharmacies that can fulfill this prescription...",
    SN: 'Zvino ndiri kutsvaga machemist anogona kupa mashonga ari muchirevo...',
    ND: 'Manje ngiyasesha amapharmacy angakwazi ukuletha le mithi...',
  },
  'rx.needLocation': {
    EN: 'To send your prescription to nearby pharmacies, I need your location.',
    SN: 'Kuti nditumire chirevo chako kumachemist pedyo, ndinoda nzvimbo yako.',
    ND: 'Ukuze ngithumele isiqinisekiso sakho kumapharmacy aseduze, ngidinga indawo yakho.',
  },
  'rx.confirmed': {
    EN: 'Prescription confirmed. Searching pharmacies with your verified medicine list…',
    SN: 'Chirevo chasimbiswa. Ndiri kutsvaga machemist nemazita emashonga ako akasimbiswa…',
    ND: 'Isiqinisekiso siqinisekisiwe. Ngiyasesha amapharmacy ngohlu lwakho lwezimithi…',
  },
  'rx.ocrFailedSent': {
    EN: 'We could not read your prescription automatically, but your image was uploaded. Nearby pharmacies can view it and reply with medicines and prices.',
    SN: 'Hatina kukwanisa kuverenga chirevo chako, asi mufananidzo waiswa. Machemist pedyo anogona kuona uye kupindura nemashonga nemitengo.',
    ND: 'Asikwazanga ukufunda isiqinisekiso sakho ngokuzenzakalelayo, kodwa isithombe silayishiwe. Amapharmacy aseduze angasibuka aphendule ngemithi namanani.',
  },
  'rx.ocrFailedNeedLocation': {
    EN: 'Share your location so we can send your prescription image to pharmacies near you.',
    SN: 'Ipa nzvimbo yako kuti titumire mufananidzo wechirevo kumachemist pedyo newe.',
    ND: 'Yabelana ngendawo yakho ukuze sithumele isithombe sesiqinisekiso kumapharmacy aseduze.',
  },
  'rx.ocrServiceUnavailable': {
    EN: 'Automatic prescription reading is temporarily unavailable. Your image can still be sent to nearby pharmacies — they will read it and reply with medicines and prices.',
    SN: 'Kuverenga chirevo zvino hakuna kushanda. Mufananidzo wako unogona kutumirwa kumachemist — vachaverenga vachipindura nemashonga.',
    ND: 'Ukufunda isiqinisekiso ngokuzenzakalelayo akutholakali okwesikhashana. Isithombe sakho singathunyelwa kumapharmacy — bazosifunda baphendule ngemithi.',
  },
  'rx.stillSendingToPharmacies': {
    EN: 'Sending your prescription image to pharmacies…',
    SN: 'Kutumira mufananidzo wechirevo kumachemist…',
    ND: 'Kuthumela isithombe sesiqinisekiso kumapharmacy…',
  },
  'payload.sendRxToPharmacies': {
    EN: 'Send prescription image to pharmacies for review',
    SN: 'Tumira mufananidzo wechirevo kumachemist kuti averenge',
    ND: 'Thumela isithombe sesiqinisekiso kumapharmacy ukuze abuyekeze',
  },

  'results.searchingFor': { EN: '💊 **Searching for:** {meds}\n\n', SN: '💊 **Kutsvaga:** {meds}\n\n', ND: '💊 **Kusesha:** {meds}\n\n' },
  'results.liveBanner': {
    EN: '📦 **Live inventory** — prices and stock from pharmacies now.\n\n',
    SN: '📦 **Zvitori zviripo zvino** — mitengo nezvipo kubva kumachemist izvozvi.\n\n',
    ND: '📦 **Isitoko esibukhoma** — amanani nesitoko samapharmacy manje.\n\n',
  },
  'results.rankingPending': {
    EN: '✅ **{count} {word} have responded. More may respond. Final ranking in 2 minutes.**\n\n',
    SN: '✅ **{count} {word} dzapindura. Dzimwe dzinogona kupindura. Kuyera kwekupedzisira mumaminitsi 2.**\n\n',
    ND: '✅ **{count} {word} ziphendulile. Ezinye zingaphendula. Ukala kokugcina ngemizuzu engu-2.**\n\n',
  },
  'results.foundLive': {
    EN: '✅ **Found {count} {word} with live stock near you:**\n\n',
    SN: '✅ **Wawanikwa {count} {word} nezvitori zviripo pedyo newe:**\n\n',
    ND: '✅ **Kutholwe {count} {word} nesitoko esibukhoma eduze kwakho:**\n\n',
  },
  'pharmacy.one': { EN: 'pharmacy', SN: 'chemist', ND: 'ipharmacy' },
  'pharmacy.many': { EN: 'pharmacies', SN: 'machemist', ND: 'amapharmacy' },
  'results.notAvailable': { EN: 'Not available', SN: 'Haisipo', ND: 'Ayitholakali' },
  'results.distance': { EN: 'Distance', SN: 'Chinhambwe', ND: 'Ibanga' },
  'results.travelTime': { EN: 'Travel Time', SN: 'Nguva Yekufamba', ND: 'Isikhathi Sokuhamba' },
  'results.prepTime': { EN: 'Preparation Time', SN: 'Nguva Yokugadzirira', ND: 'Isikhathi Soku Lungisa' },
  'results.totalTime': { EN: 'Total Time', SN: 'Nguva Yose', ND: 'Isikhathi Esiphelele' },
  'results.score': { EN: 'Score', SN: 'Chibodzwa', ND: 'Amaphuzu' },
  'results.medicines': { EN: 'Medicines', SN: 'Mashonga', ND: 'Imithi' },
  'results.price': { EN: 'Price', SN: 'Mutengo', ND: 'Intengo' },
  'results.qty': { EN: 'qty', SN: 'huwandu', ND: 'ubuningi' },
  'results.alternative': { EN: 'Alternative', SN: 'Zvimwe', ND: 'Okunye' },
  'results.notes': { EN: 'Notes', SN: 'Zvinyorwa', ND: 'Amanothi' },

  'ui.medicinesForSearch': {
    EN: 'Medicines for this search:',
    SN: 'Mashonga ekutsvagwa uku:',
    ND: 'Imithi yalokhu kusesha:',
  },
  'ui.liveStockBanner': {
    EN: 'Live inventory — stock and prices from pharmacies now.',
    SN: 'Zvitori zviripo — zvipo nemitengo kubva kumachemist izvozi.',
    ND: 'Isitoko esibukhoma — isitoko namanani samapharmacy manje.',
  },
  'ui.rankingPendingNote': {
    EN: 'Final ranking in 2 minutes. Keep this chat open to see updates.',
    SN: 'Kuyera kwekupedzisira mumaminitsi 2. Shaisa hurukuro iri kuvhura kuti uone zvitsva.',
    ND: 'Ukala kokugcina ngemizuzu engu-2. Vula le ngxoxo ukuze ubone izibuyekezo.',
  },
  'ui.reserveTitle': {
    EN: 'Reserve at a pharmacy (where available) or get directions — pick up within 2 hours',
    SN: 'Chengeta kuchemist (kana iripo) kana tora nzira — tora mukati memaawa 2',
    ND: 'Beka ku-pharmacy (lapho kukhona) noma thola indlela — landa phakathi kwamahora angu-2',
  },
  'ui.reserveLive': {
    EN: 'Reserve at pharmacy (pick up within 2 hours) — choose which medicine to reserve, or get directions',
    SN: 'Chengeta kuchemist (tora mukati memaawa 2) — sarudza mushonga, kana tora nzira',
    ND: 'Beka ku-pharmacy (landa emahoreni angu-2) — khetha umuthi, noma thola indlela',
  },
  'ui.directionsNow': {
    EN: 'Get directions now — ranking can still change in ~2 minutes',
    SN: 'Tora nzira izvozvi — kuyera kunogona kuchinja mumaminitsi ~2',
    ND: 'Thola indlela manje — ukala lungashintsha emizuzwini engu-~2',
  },
  'ui.getDirections': { EN: 'Get directions', SN: 'Tora nzira', ND: 'Thola indlela' },
  'ui.reserve': { EN: 'Reserve', SN: 'Chengeta', ND: 'Beka' },
  'ui.reserved': { EN: 'Reserved', SN: 'Yachengetwa', ND: 'Kubekiwe' },
  'ui.callPharmacy': { EN: 'Call pharmacy', SN: 'Fona chemist', ND: 'Fonela ipharmacy' },
  'ui.callToReserve': { EN: 'Call to reserve', SN: 'Fona kuchengeta', ND: 'Fonela ukubeka' },
  'ui.unavailableCall': { EN: 'Unavailable — call to reserve', SN: 'Haisipo — fona kuchengeta', ND: 'Ayitholakali — fonela ukubeka' },
  'ui.rateExperience': { EN: 'Rate your experience', SN: 'Kuyera ruzivo rwako', ND: 'Linganisa ulwazi lwakho' },
  'ui.rated': { EN: 'Rated', SN: 'Yakayirirwa', ND: 'Kulinganisiwe' },
  'ui.newResponses': { EN: 'New response(s)', SN: 'Mhinduro itsva', ND: 'Izimpendulo ezintsha' },
  'ui.drugInteractions': { EN: 'Drug interaction check', SN: 'Kuongorora kwekubatanidza mashonga', ND: 'Ukuhlola ukuxubana kwemithi' },
  'ui.drugDisclaimer': {
    EN: 'Always consult your doctor or pharmacist before combining medicines.',
    SN: 'Gara uconsult doctor kana pharmacist usati wabatanidza mashonga.',
    ND: 'Hlala uthintana nodokotela noma umelaphi ngaphambi kokuxuba imithi.',
  },
  'ui.ddiSource': {
    EN: 'Source: {source}',
    SN: 'Chinhu: {source}',
    ND: 'Umthombo: {source}',
  },

  'na': { EN: 'N/A', SN: 'Haisipo', ND: 'Ayikho' },

  'results.recommendation': {
    EN: '⭐ **Recommendation:** {reason}\n\n',
    SN: '⭐ **Kurudziro:** {reason}\n\n',
    ND: '⭐ **Isincomelo:** {reason}\n\n',
  },
  'results.recommendationDefault': {
    EN: 'I recommend **{pharmacy}** because it offers the best combination of availability, price, distance, and time.',
    SN: 'Ndakurudzira **{pharmacy}** nekuti ine mashonga, mutengo, chinhambwe, nenguva zvakanaka.',
    ND: 'Ngiyalulela **{pharmacy}** ngoba inikeza ukutholakala, intengo, ibanga nesikhathi ezinhle.',
  },
  'results.onlyAlternatives': {
    EN: "💡 **Doesn't have your exact item in stock — offered alternative(s) below.**\n",
    SN: '💡 **Haina chinhu chako chaizvo — vakapa zvimwe pazasi.**\n',
    ND: '💡 **Ayinaso into oyifunayo — banikeze okunye ngezansi.**\n',
  },
  'results.alternativesLine': {
    EN: '   💡 {label}: ',
    SN: '   💡 {label}: ',
    ND: '   💡 {label}: ',
  },
  'results.suggestedBy': {
    EN: '{medicine} (suggested by {who})',
    SN: '{medicine} (yakakurudzirwa na {who})',
    ND: '{medicine} (kuphakanyiswa ngu {who})',
  },
  'results.pharmacistAlternative': {
    EN: ' — (pharmacist alternative)',
    SN: ' — (mushonga wechemist)',
    ND: ' — (umuthi wommelaphi)',
  },
  'results.foundCount': {
    EN: '✅ **{count} {word}**\n\n',
    SN: '✅ **{count} {word}**\n\n',
    ND: '✅ **{count} {word}**\n\n',
  },
  'results.availableAt': {
    EN: '✅ **Available at {count} {word}:**\n\n',
    SN: '✅ **Inowanikwa kuna {count} {word}:**\n\n',
    ND: '✅ **Iyatholakala ku {count} {word}:**\n\n',
  },
  'results.priceLine': { EN: '   💰 Price: ${price}\n', SN: '   💰 Mutengo: ${price}\n', ND: '   💰 Intengo: ${price}\n' },

  'error.medicineNameMissing': {
    EN: 'Medicine name is missing.',
    SN: 'Zita remushonga haripo.',
    ND: 'Igama lomuthi alikho.',
  },
  'msg.newResponsesFrom': {
    EN: 'New response(s) from {count} {word}.',
    SN: 'Mhinduro itsva kubva kuna {count} {word}.',
    ND: 'Izimpendulo ezintsha ezivela ku {count} {word}.',
  },
  'msg.reservedAt': {
    EN: 'Reserved at {pharmacy}. {status}. Please pick up within 2 hours.',
    SN: 'Yachengetwa ku {pharmacy}. {status}. Tora mukati memaawa 2.',
    ND: 'Kubekiwe ku {pharmacy}. {status}. Sicela ulande phakathi kwamahora angu-2.',
  },
  'msg.reservedAtBanner': {
    EN: 'Reserved at {pharmacy}',
    SN: 'Yachengetwa ku {pharmacy}',
    ND: 'Kubekiwe ku {pharmacy}',
  },
  'footer.mediBotHint': {
    EN: 'MediBot can make mistakes. For emergencies, call your local health centre.',
    SN: 'MediBot inogona kukanganisa. Mumamiriro ezvinhu, fonera chipatara chako.',
    ND: 'UMediBot angenza amaphutha. Ezimo eziphuthumayo, fonela isikhungo sakho sezempilo.',
  },
  'footer.healthDisclaimer': {
    EN: '⚠️ General health info only — consult a healthcare provider for medical advice.',
    SN: '⚠️ Ruzivo rwepamutemo chete — consult nyanzvi yezveutano.',
    ND: '⚠️ Ulwazi lwezempilo jikelele kuphela — thinta umhlinzeki wezempilo.',
  },
  'ui.altReservePhone': {
    EN: 'Alternative medicines must be reserved by phone',
    SN: 'Mashonga ekupedzisira anofanirwa kuchengetwa nefoni',
    ND: 'Imithi ehlukile kufanele ibekwe ngocingo',
  },
}


/** Append carry-your-Rx reminder for prescription uploads (idempotent). */
