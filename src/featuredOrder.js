/* Hand-set order for the Featured sort. FEATURED_TOP come first, in this order; FEATURED_LAST sink to the end.
   Everything else keeps its order in data.jsx. Edit these two lists to curate the gallery. */
const FEATURED_TOP = [
  "cr-goodboytreats",
  "cr-latenightlamp",
  "cr-puddleready", "cr-slowsunday",
  "cr-goodhairday", "cr-unrollmat",
  "cr-turnuproof", "cr-bringithome",
  "cr-poolday",
  "cr-dinnerin15", "cr-sleepsacks",
  "cr-carryallyellow", "cr-everydaypearls",
  "cr-bestpartwalk",
  "cr-bareskin", "cr-earlymiles", "cr-coldnightfix",
  "cr-raincheck",
  "cr-thronecattree", "cr-seeyousunny",
  "cr-taxiperfume", "cr-dailywin",
  "cr-firstridebike",
  "cr-garageleggings", "cr-floorrug",
  "cr-departurescabin", "cr-showoffcarwash",
  "cr-tramheadphones", "cr-skatesneakers",
  "cr-naplord", "cr-firstdaybag", "cr-hearthcandle",
  "cr-dinercoffee", "cr-glossmirror",
  "cr-beachsunscreen",
  "cr-sundayperfume", "cr-climbprotein", "cr-embersauce", "cr-yellowsuitcases",
  "cr-doormats", "cr-campsleepingbags", "cr-kidsartsets", "cr-foamrollers", "cr-ceramicmugs",
  "cr-coolerbags", "cr-pillowcases", "cr-hairclips", "cr-shakerbottles", "cr-kneeicepacks",
  "cr-knityarn", "cr-jigsaws", "cr-warmfairylights", "cr-wallclocks", "cr-dogleashes",
  "cr-adventcalendars", "cr-snowboots", "cr-boardgames", "cr-cookiecutters",
  "cr-smoothieblenders", "cr-cosyhotwaterbottles", "cr-babybibs",
  "cr-raindayumbrellas", "cr-toolboxes", "cr-kidsrainboots", "cr-chunkyscarves", "cr-bathtowels", "cr-alarmclocks",
  "cr-bikelights", "cr-kitchenscales", "cr-desklamps", "cr-cozyslippers",
  "cr-chefknives", "cr-dogballs", "cr-skigoggles", "cr-writenotebooks", "cr-carvacuums", "cr-gardengloves",
  "cr-thermosflasks", "cr-kidsbikes", "cr-wintergloves", "cr-jumpropes", "cr-swaddles", "cr-lashmascara",
  "cr-halloweencostumes", "cr-sleepmasks", "cr-herbkits", "cr-readingglasses", "cr-cattrees",
  "cr-beachspeakers", "cr-honeyjars", "cr-balloonarches", "cr-xmasjumpers", "cr-packingcubes", "cr-powerbanks",
  "cr-woodenblocks", "cr-moisturiserjar", "cr-carwashkits",
  "cr-dogtoys", "cr-standmixers", "cr-skincareflat",
  "cr-babycarriers", "cr-bbqtools",
  "cr-balconypots", "cr-lunchboxes", "cr-trailbottles", "cr-gymsets",
  "cr-dogbeds", "cr-totebags", "cr-throwblankets", "cr-cabinbags",
  "cr-fh-sweatpants", "cr-kidsraincoats", "cr-dogcoats", "cr-coffeebags", "cr-yogamats",
  "cr-fh-flannel", "cr-fh-puffer", "cr-fh-slides", "cr-fh-swimsuits", "cr-fh-denimshorts",
  "cr-fh-beanies", "cr-fh-backpacks", "cr-fh-crossbody", "cr-fh-linenshirts",
  "cr-fh-resort", "cr-fh-whitetees", "cr-fh-caps", "cr-fh-leatherjacket", "cr-fh-knitwear",
  "cr-fh-tailoring", "cr-fh-velvetsuit", "cr-fh-luggage", "cr-fh-runner", "cr-fh-greysneaker", "cr-fh-hoodie", "cr-fh-graphictee", "cr-fh-reddress",
  "cr-beachumbrella", "cr-tiedye", "cr-spraypaint", "cr-fruitbowl", "cr-disposablecamera", "cr-ironpatches", "cr-matchboxes", "cr-saladservers", "cr-tarotdeck",
  "cr-barstool", "cr-fedora", "cr-irons", "cr-kitchentimer", "cr-markers",
  "cr-escooter", "cr-alarmclock", "cr-coupes", "cr-foldingbike", "cr-enamelpins", "cr-scissors", "cr-vinylrecords",
  "cr-bodyglitter", "cr-phonecharms", "cr-cassetteplayer", "cr-macrame", "cr-icecreammaker",
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  "cr-baby", "cr-blackfriday-denim", "cr-boots", "cr-bridesmaid",
  "cr-clawclip", "cr-massagegun", "cr-matcha", "cr-mugs", "cr-xmaspjs", 
  "cr-hoteltowels",
  "cr-carvac", "cr-icedtea", "cr-lipbalm", "cr-mothersday", "cr-mouse", 
  "cr-carkit", "cr-cattoy", "cr-fizz", "cr-freshener", "cr-hoops", "cr-kidsunglasses", "cr-necklace", "cr-perfume-y2k", "cr-trainers", "cr-yogamat",
  "cr-bottle", "cr-carrier", "cr-headphones", "cr-honey", "cr-jeans", "cr-sunscreen", "cr-sweater",
  "cr-backpack", "cr-cape", "cr-cologne", "cr-pan", "cr-phonemount", "cr-protein", "cr-ring", "cr-sheets", "cr-suitcase", "cr-tracksuit", "cr-watch",
  "cr-coat", "cr-dogtreats", "cr-hairoil", "cr-hoodies", "cr-petbed", "cr-powerbank", "cr-puffer", "cr-runshoe",
  "cr-coldbrew", "cr-sunglasses", "cr-serum", "cr-socks", "cr-earbuds", "cr-gummies", "cr-lipstick", "cr-armchair", "cr-chilicrisp", "cr-perfume", "cr-rainboots", "cr-towels", "cr-denim-car", "cr-suit",
  "ec9-bag-bf", "ec9-bag-cyber", "ec9-bag-xmas", "ec9-bag-halloween", "ec9-bag-valentine", "ec9-bag-summer", "ec9-bag-sneaker", "ec9-bag-beauty", "ec9-bag-newyear", "ec9-bag-easter",
  "ec8-creatine", "ec8-collagen", "ec8-bands", "ec8-runshoes", "ec8-preworkout", "ec8-dumbbells", "ec8-earrings", "ec8-mensrwatch", "ec8-pearls", "ec8-coffeebag", "ec8-hotsauce", "ec8-tea", "ec8-chocolate", "ec8-dogtreats", "ec8-catfountain", "ec8-vacuum", "ec8-airfryer", "ec8-cleaner", "ec8-baby", "ec8-thanksgiving", "ec8-y2kmegasale", "ec8-laborday", "ec8-grooming", "ec8-christmastech",
  "ec7-leggings", "ec7-hoodie", "ec7-boots", "ec7-teepack", "ec7-y2kcargo", "ec7-y2kdenim", "ec7-suit", "ec7-handbag", "ec7-socks", "ec7-nyedress", "ec7-mascara", "ec7-foundation", "ec7-hairdryer", "ec7-nightroutine", "ec7-pressnails", "ec7-y2kperfume", "ec7-bodylotion", "ec7-hairclay", "ec7-easterpalette", "ec7-speaker", "ec7-keyboard", "ec7-powerbank", "ec7-headset", "ec7-phonecase", "ec7-laptop",
  "ec4-sneakers", "ec4-hairoil", "ec4-matcha", "ec4-lipstick", "ec4-jeans", "ec4-gummies", "ec4-petbed", "ec4-weekender", "ec4-beardoil",
  "ec5-halloween", "ec5-blackfriday-audio", "ec5-cybermonday", "ec5-christmas-knit", "ec5-christmas-gold", "ec5-valentines", "ec5-easter", "ec5-flash", "ec5-newyear", "ec5-mothersday", "ec5-summer", "ec5-backtoschool", "ec5-clearance", "ec5-bogo", "ec5-blackfriday-fashion", "ec5-y2k-blackfriday", "ec5-y2k-valentines", "ec5-y2k-flash",
  "ec6-gym", "ec6-jewelry", "ec6-skincare", "ec6-pets", "ec6-earbuds", "ec6-halloween-fashion", "ec6-christmas-pjs",
  "ec3-coffee", "ec3-knife", "ec3-sunglasses", "ec3-watch", "ec3-backpack", "ec3-yoga", "ec3-protein", "ec3-phone", "ec3-toys", "ec3-plant", "ec3-perfume", "ec3-sunscreen",
  "ec2-serum", "ec2-earbuds", "ec2-puffer", "ec2-candle", "ec2-water-bottle", "ec2-duvet", "ec2-dog", "ec2-routine", "ec2-ring", "ec2-blackfriday", "ec2-cardigan", "ec2-sisters",
  "review-cards-cream", "breaking-news-shoes", "dont-buy-another-candle", "side-effects-stamp-tote",
  "two-receipts-boots", "chat-insoles-shift", "selfie-captions-serum", "four-reasons-candle",
  "strikethrough-bottle", "compare-old-vs-new-bag", "timeline-7-14-30-nights", "notes-list-topper", "chat-espresso-group",
];
const FEATURED_LAST = ["hero-product", "masthead-behind", "sand-message", "split-proof"];
export { FEATURED_TOP, FEATURED_LAST };
