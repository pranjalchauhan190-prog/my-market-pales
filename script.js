let selectedCategory = "All";

let cart = (() => {
    try {
        const savedCart = localStorage.getItem("cart");
        const parsedCart = savedCart ? JSON.parse(savedCart) : [];
        return Array.isArray(parsedCart) ? parsedCart : [];
    } catch (error) {
        return [];
    }
})();

let wishlist = (() => {
    try {
        const savedWishlist = localStorage.getItem("wishlist");
        const parsedWishlist = savedWishlist ? JSON.parse(savedWishlist) : [];
        return Array.isArray(parsedWishlist) ? parsedWishlist : [];
    } catch (error) {
        return [];
    }
})();

function normalizeWishlistName(item) {
    if (typeof item === "string") {
        return item.trim();
    }

    if (item && typeof item === "object") {
        return String(
            item.name || item.productName || item.title || ""
        ).trim();
    }

    return "";
}

function getWishlistNames() {
    return wishlist
        .map(normalizeWishlistName)
        .filter(Boolean);
}


// ===============================
// SIDE MENU
// ===============================

function openMenu() {

    const menu = document.getElementById("sideMenu");

    if (!menu) return;

    menu.classList.add("show");

    document.body.classList.add("menu-open");
}


// CLOSE MENU
function closeMenu() {

    const menu = document.getElementById("sideMenu");

    if (!menu) return;

    menu.classList.remove("show");

    document.body.classList.remove("menu-open");
}


// CLOSE BUTTON
function forceCloseMenu() {

    closeMenu();

}


// HOME
function goHome() {

    closeMenu();

    if (
        window.location.pathname.endsWith("index.html") ||
        window.location.pathname.endsWith("/")
    ) {

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    } else {

        window.location.href = "index.html";

    }

}


// ESC KEY
document.addEventListener("keydown", function(event) {

    if (event.key === "Escape") {

        closeMenu();

    }

});


// CLICK OUTSIDE MENU TO CLOSE
document.addEventListener("click", function(event) {

    const menu =
        document.getElementById("sideMenu");

    if (!menu) return;

    if (!menu.classList.contains("show")) return;

    const menuButton =
        event.target.closest(".menu-button");

    const clickedInsideMenu =
        event.target.closest("#sideMenu");

    if (!clickedInsideMenu && !menuButton) {

        closeMenu();

    }

});


// ===============================
// CATEGORY
// ===============================

function filterCategory(category, button) {

    const isHome = window.location.pathname.endsWith("index.html") || window.location.pathname.endsWith("/");
    if (isHome && category && category !== "All") {
        window.location.href = "shop.html?category=" + encodeURIComponent(category);
        return;
    }

    selectedCategory = category;


    document
        .querySelectorAll(
            ".category-scroll .category-card"
        )
        .forEach(function(card) {

            card.classList.remove(
                "active-category"
            );

        });


    if (button) {

        button.classList.add(
            "active-category"
        );

    }


    applyFilters();

}

async function loadHomepageCategories() {
    const container = document.querySelector(".category-scroll");
    if (!container) return;

    try {
        const response = await fetch("/categories", { method: "GET", cache: "no-store" });
        const data = await response.json();
        const categories = Array.isArray(data && data.categories) ? data.categories : [];
        const activeCategories = categories
            .filter(category => category && String(category.name || "").trim() && category.active !== false)
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

        if (!activeCategories.length) return;

        container.innerHTML = activeCategories.map((category, index) => `
            <button class="category-card ${index === 0 ? "active-category" : ""}" onclick="filterCategory(${JSON.stringify(category.name || "")}, this)">
                <div class="category-card-image">
                    <img src="${encodeURI(category.image || "product.jpg")}" alt="${category.name || "Category"}" onerror="this.onerror=null;this.src='product.jpg';">
                </div>
                <span>${category.name || "Category"}</span>
            </button>
        `).join("");
    } catch (error) {
        console.warn("Category load failed:", error);
    }
}

function notifyCategorySync() {
    try {
        localStorage.setItem("myMarketplaceCategorySync", String(Date.now()));
    } catch (error) {
        console.warn("Category sync notification failed:", error);
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
        if (event.key === "myMarketplaceCategorySync") {
            loadHomepageCategories();
        }
    });
}

async function loadHomepagePromotion() {
    const title = document.getElementById("offerTitle");
    const subtitle = document.getElementById("offerSubtitle");
    const code = document.getElementById("couponCode");
    const description = document.getElementById("offerTerms");
    if (!title && !subtitle && !code && !description) return;

    try {
        const response = await fetch("/promotion", { method: "GET", cache: "no-store" });
        const data = await response.json();
        const promotion = data && data.promotion ? data.promotion : null;
        if (!promotion) return;
        if (title) title.innerHTML = `Get <span>${promotion.title || "25% Off"}</span>`;
        if (subtitle) subtitle.textContent = promotion.subtitle || "Up To ₹200 Off*";
        if (code) code.textContent = promotion.code || "MYMARKETPLACE";
        if (description) description.textContent = promotion.description || "*On your first order | T&C apply";
        if (promotion.code) {
            const button = document.getElementById("couponCodeButton");
            if (button) {
                button.setAttribute("title", `Copy coupon code: ${promotion.code}`);
            }
        }
    } catch (error) {
        console.warn("Promotion load failed:", error);
    }
}

async function copyCouponCode() {
    const code = document.getElementById("couponCode")?.textContent || "";
    const status = document.getElementById("couponCopyStatus");
    if (!code) return;

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(code);
        } else {
            const textarea = document.createElement("textarea");
            textarea.value = code;
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
        }
        if (status) {
            status.textContent = "Coupon copied!";
        }
    } catch (error) {
        if (status) {
            status.textContent = "Copy failed";
        }
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const pathname = window.location.pathname || "/";
    const isHomepage = pathname === "/" || pathname.endsWith("/index.html") || pathname.endsWith("/");

    if (document.querySelector(".category-scroll") && isHomepage) {
        loadHomepageCategories();
    }
    if (document.getElementById("couponCode")) {
        loadHomepagePromotion();
        const couponButton = document.getElementById("couponCodeButton");
        if (couponButton) {
            couponButton.addEventListener("click", copyCouponCode);
        }
    }
});


// ===============================
// FILTER
// ===============================

function applyFilters() {

    const priceFilterElement =
        document.getElementById("priceFilter");


    const priceFilter =
        priceFilterElement
            ? priceFilterElement.value
            : "all";


    document
        .querySelectorAll(".product")
        .forEach(function(product) {

            const category =
                product.getAttribute(
                    "data-category"
                );


            const price =
                Number(
                    product.getAttribute(
                        "data-price"
                    )
                );


            const categoryMatch =
                selectedCategory === "All" ||
                category === selectedCategory;


            const priceMatch =
                priceFilter === "all" ||
                price <= Number(priceFilter);


            product.style.display =
                categoryMatch && priceMatch
                    ? ""
                    : "none";

        });

}


// ===============================
// SEARCH
// ===============================

function searchProducts() {

    const input =
        document.getElementById("searchInput");


    if (!input) return;


    const text =
        input.value
            .toLowerCase()
            .trim();


    const products =
        document.querySelectorAll(
            ".product"
        );


    if (text === "") {

        products.forEach(function(product) {

            product.style.display = "";

        });


        showToast(
            "Search",
            "All products are showing.",
            "⌕"
        );

        return;

    }


    let found = 0;


    products.forEach(function(product) {

        const productText =
            product.innerText.toLowerCase();


        if (productText.includes(text)) {

            product.style.display = "";

            found++;

        } else {

            product.style.display = "none";

        }

    });


    if (found > 0) {

        showToast(
            "Search Results",
            found + " product(s) found.",
            "✓"
        );

    } else {

        showToast(
            "No Results",
            "No product found for \"" +
            input.value +
            "\".",
            "!"
        );

    }

}


// ENTER SEARCH
document.addEventListener(
    "DOMContentLoaded",
    function() {

        const searchInput =
            document.getElementById(
                "searchInput"
            );


        if (!searchInput) return;


        searchInput.addEventListener(
            "keydown",
            function(event) {

                if (event.key === "Enter") {

                    searchProducts();

                }

            }
        );

    }
);


// ===============================
// WISHLIST
// ===============================

function saveProduct(button) {

    if (!button) return;


    const product =
        button.closest(".product");


    if (!product) return;


    const name =
        String(
            product.getAttribute("data-name") || ""
        ).trim();

    if (!name) return;

    const savedNames = getWishlistNames();
    const index = savedNames.indexOf(name);


    if (index === -1) {

        wishlist.push(name);


        button.innerText = "♥";

        button.style.color = "red";


        showToast(
            "Saved",
            name +
            " added to your saved designs.",
            "♥"
        );

    } else {

        wishlist = wishlist.filter(
            function(item) {
                return normalizeWishlistName(item) !== name;
            }
        );


        button.innerText = "♡";

        button.style.color = "#222";


        showToast(
            "Removed",
            name +
            " removed from saved designs.",
            "✓"
        );

    }


    localStorage.setItem(
        "wishlist",
        JSON.stringify(wishlist)
    );


    updateCounts();

}


// UPDATE SAVED BUTTONS
function updateSavedButtons() {

    const savedNames = getWishlistNames();

    document
        .querySelectorAll(".product")
        .forEach(function(product) {

            const name =
                String(
                    product.getAttribute("data-name") || ""
                ).trim();


            const button =
                product.querySelector(
                    ".save-button"
                );


            if (!button) return;


            if (savedNames.includes(name)) {

                button.innerText = "♥";

                button.style.color = "red";

            } else {

                button.innerText = "♡";

                button.style.color = "#222";

            }

        });

}


// ===============================
// CART
// ===============================

function addToCart(name) {

    cart.push({
        name: name
    });


    localStorage.setItem(
        "cart",
        JSON.stringify(cart)
    );


    updateCounts();


    showToast(
        "Added to Cart",
        name + " added to your cart.",
        "🛍"
    );

}


// ===============================
// COUNTS
// ===============================

function updateCounts() {

    const cartCount =
        document.getElementById(
            "cartCount"
        );


    const wishlistCount =
        document.getElementById(
            "wishlistCount"
        );


    if (cartCount) {

        cartCount.innerText =
            cart.length;


        cartCount.classList.toggle(
            "has-items",
            cart.length > 0
        );

    }


    if (wishlistCount) {

        wishlistCount.innerText =
            wishlist.length;


        wishlistCount.classList.toggle(
            "has-items",
            wishlist.length > 0
        );

    }

}


// ===============================
// PRODUCT PAGE
// ===============================

function viewProduct(name) {

    window.location.href =
        "product.html?product=" +
        encodeURIComponent(name);

}


// ===============================
// CART PAGE
// ===============================

function openCart() {

    window.location.href =
        "cart.html";

}


// ===============================
// WISHLIST PAGE
// ===============================

function openWishlist() {

    window.location.href =
        "wishlist.html";

}


// ===============================
// HERO
// ===============================

function shopNow() {

    const products =
        document.querySelector(
            "#products"
        );


    if (!products) return;


    products.scrollIntoView({
        behavior: "smooth"
    });

}


// ===============================
// CUSTOM
// ===============================

function customOrder() {

    showToast(
        "Custom Tailoring",
        "Custom tailoring service selected.",
        "✂"
    );

}


// ===============================
// REPAIR
// ===============================

function repairOrder() {

    showToast(
        "Repair & Alteration",
        "Repair service selected.",
        "✂"
    );

}


// ===============================
// DESIGN
// ===============================

function showDesigns() {

    const categoryContainer =
        document.querySelector(
            ".category-container"
        );


    if (!categoryContainer) return;


    categoryContainer.scrollIntoView({
        behavior: "smooth"
    });

}


// ===============================
// DELIVERY
// ===============================

function deliveryInfo() {

    showToast(
        "Home Delivery",
        "Home delivery information selected.",
        "✓"
    );

}


// ===============================
// PROFESSIONAL TOAST POPUP
// ===============================

let toastTimer;


function showToast(
    title,
    message,
    icon = "✓"
) {

    const toast =
        document.getElementById(
            "toast"
        );


    const toastTitle =
        document.getElementById(
            "toastTitle"
        );


    const toastMessage =
        document.getElementById(
            "toastMessage"
        );


    const toastIcon =
        document.getElementById(
            "toastIcon"
        );


    if (
        !toast ||
        !toastTitle ||
        !toastMessage ||
        !toastIcon
    ) {

        return;

    }


    toastTitle.innerText =
        title;


    toastMessage.innerText =
        message;


    toastIcon.innerText =
        icon;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            function() {

                toast.classList.remove(
                    "show"
                );

            },
            3000
        );

}


// ===============================
// REMOVE FROM WISHLIST
// ===============================

function removeFromWishlist(name) {

    const safeName = String(name || "").trim();

    if (!safeName) {
        window.location.reload();
        return;
    }

    wishlist = wishlist.filter(
        function(item) {
            return normalizeWishlistName(item) !== safeName;
        }
    );

    localStorage.setItem(
        "wishlist",
        JSON.stringify(wishlist)
    );

    window.location.reload();

}


// =====================================================
// WEBSITE LANGUAGE SYSTEM
// =====================================================

const languageTranslations = {

    "My Marketplace":
        "माय मार्केटप्लेस",

    "Fashion":
        "फैशन",

    "Tailoring":
        "सिलाई",

    "Custom Designs":
        "कस्टम डिज़ाइन",

    "Search dresses, blouse, designs...":
        "ड्रेस, ब्लाउज़, डिज़ाइन खोजें...",

    "Menu":
        "मेन्यू",

    "Home":
        "होम",

    "My Account":
        "मेरा अकाउंट",

    "My Orders":
        "मेरे ऑर्डर",

    "Repair & Alteration":
        "रिपेयर और अल्टरेशन",

    "Design Gallery":
        "डिज़ाइन गैलरी",

    "Saved Designs":
        "सेव किए गए डिज़ाइन",

    "Settings":
        "सेटिंग्स",

    "Language":
        "भाषा",

    "Help & Support":
        "मदद और सहायता",

    "Your Style.":
        "आपका स्टाइल।",

    "Your Design.":
        "आपका डिज़ाइन।",

    "Your Fit.":
        "आपकी फिटिंग।",

    "Discover beautiful ladies fashion, custom tailoring, designer outfits and professional clothing services.":
        "खूबसूरत महिलाओं के फैशन, कस्टम सिलाई, डिज़ाइनर आउटफिट और प्रोफेशनल कपड़ों की सेवाएँ खोजें।",

    "Custom Tailoring":
        "कस्टम सिलाई",

    "Unique Designs":
        "यूनिक डिज़ाइन",

    "Home Delivery":
        "होम डिलीवरी",

    "Featured Designs & Products":
        "खास डिज़ाइन और प्रोडक्ट्स",

    "Explore our latest collection.":
        "हमारा नया कलेक्शन देखें।",

    "All Prices":
        "सभी कीमतें",

    "Under ₹500":
        "₹500 से कम",

    "Under ₹1,000":
        "₹1,000 से कम",

    "Under ₹2,000":
        "₹2,000 से कम",

    "Under ₹5,000":
        "₹5,000 से कम",

    "Blouse Design":
        "ब्लाउज़ डिज़ाइन",

    "Suit Design":
        "सूट डिज़ाइन",

    "Kurti Design":
        "कुर्ती डिज़ाइन",

    "Lehenga Design":
        "लहंगा डिज़ाइन",

    "Designer Blouse":
        "डिज़ाइनर ब्लाउज़",

    "Designer Suit":
        "डिज़ाइनर सूट",

    "Modern Kurti":
        "मॉडर्न कुर्ती",

    "Designer Lehenga":
        "डिज़ाइनर लहंगा",

    "View Product":
        "प्रोडक्ट देखें",

    "Our Services":
        "हमारी सेवाएँ",

    "Professional clothing services for every requirement.":
        "हर जरूरत के लिए प्रोफेशनल कपड़ों की सेवाएँ।",

    "Design Selection":
        "डिज़ाइन चयन",

    "Explore":
        "देखें",

    "Get your outfit stitched according to your measurements, design and fabric.":
        "अपनी माप, डिज़ाइन और कपड़े के अनुसार अपना आउटफिट सिलवाएँ।",

    "Repair damaged clothes or get fitting and alteration work done professionally.":
        "खराब कपड़ों की मरम्मत या फिटिंग और अल्टरेशन का काम प्रोफेशनल तरीके से करवाएँ।",

    "Explore blouse, neck, sleeve, back, lace, border and other fashion designs.":
        "ब्लाउज़, नेक, स्लीव, बैक, लेस, बॉर्डर और अन्य फैशन डिज़ाइन देखें।",

    "Get your completed stitching and repair orders delivered conveniently to your home.":
        "अपने पूरे किए गए सिलाई और रिपेयर ऑर्डर घर पर आसानी से प्राप्त करें।",

    "No Saved Designs":
        "कोई सेव किया हुआ डिज़ाइन नहीं",

    "Your favourite designs and products.":
        "आपके पसंदीदा डिज़ाइन और प्रोडक्ट्स।",

    "You haven't saved any products yet.":
        "आपने अभी तक कोई प्रोडक्ट सेव नहीं किया है।",

    "Explore Designs":
        "डिज़ाइन देखें",

    "Remove":
        "हटाएँ",

    "No Orders Yet":
        "अभी कोई ऑर्डर नहीं",

    "Explore Products":
        "प्रोडक्ट्स देखें",

    "Create Your Account":
        "अपना अकाउंट बनाएँ",

    "Login":
        "लॉगिन",

    "Create Account":
        "अकाउंट बनाएँ",

    "Full Name":
        "पूरा नाम",

    "Mobile Number":
        "मोबाइल नंबर",

    "Email":
        "ईमेल",

    "Password":
        "पासवर्ड",

    "Show Password":
        "पासवर्ड दिखाएँ",

    "Hide Password":
        "पासवर्ड छिपाएँ",

    "Notifications":
        "नोटिफिकेशन",

    "Privacy":
        "प्राइवेसी",

    "Shopping Preferences":
        "शॉपिंग प्राथमिकताएँ",

    "Order History":
        "ऑर्डर हिस्ट्री",

    "Clear Local Data":
        "सेव किया हुआ डेटा हटाएँ",

    "English":
        "अंग्रेज़ी",

    "Hindi":
        "हिंदी",

    "Enable notifications":
        "नोटिफिकेशन चालू करें",

    "Change Language":
        "भाषा बदलें",

    "View Privacy":
        "प्राइवेसी देखें",

    "Data Cleared":
        "डेटा हटा दिया गया",

    "Language Updated":
        "भाषा अपडेट हो गई",

    "Notifications Enabled":
        "नोटिफिकेशन चालू",

    "Notifications Disabled":
        "नोटिफिकेशन बंद",

    "Continue Shopping":
        "शॉपिंग जारी रखें",

    "Logout":
        "लॉगआउट"

};


function getHindiText(text) {

    const cleanText =
        text.trim();


    return (
        languageTranslations[
            cleanText
        ] || cleanText
    );

}


function applyWebsiteLanguage(
    language
) {

    document
        .querySelectorAll(
            "body *:not(script):not(style)"
        )
        .forEach(function(element) {

            if (
                element.children.length === 0 &&
                element.innerText.trim() !== ""
            ) {

                if (
                    !element.dataset.originalText
                ) {

                    element.dataset.originalText =
                        element.innerText;

                }


                const original =
                    element.dataset.originalText
                        .trim();


                if (language === "Hindi") {

                    if (
                        languageTranslations[
                            original
                        ]
                    ) {

                        element.innerText =
                            languageTranslations[
                                original
                            ];

                    }

                } else {

                    element.innerText =
                        element.dataset.originalText;

                }

            }

        });


    document
        .querySelectorAll(
            "input, textarea"
        )
        .forEach(function(input) {

            if (input.placeholder) {

                if (
                    !input.dataset.originalPlaceholder
                ) {

                    input.dataset.originalPlaceholder =
                        input.placeholder;

                }


                const original =
                    input.dataset.originalPlaceholder;


                if (language === "Hindi") {

                    if (
                        languageTranslations[
                            original
                        ]
                    ) {

                        input.placeholder =
                            languageTranslations[
                                original
                            ];

                    }

                } else {

                    input.placeholder =
                        input.dataset.originalPlaceholder;

                }

            }

        });


    localStorage.setItem(
        "setting_language",
        language
    );

}


function loadWebsiteLanguage() {

    const language =
        localStorage.getItem(
            "setting_language"
        ) || "English";


    applyWebsiteLanguage(
        language
    );


    const languageText =
        document.getElementById(
            "languageText"
        );


    if (languageText) {

        languageText.innerText =
            language;

    }

}


function changeLanguage() {

    const currentLanguage =
        localStorage.getItem(
            "setting_language"
        ) || "English";


    const newLanguage =
        currentLanguage === "English"
            ? "Hindi"
            : "English";


    applyWebsiteLanguage(
        newLanguage
    );


    const languageText =
        document.getElementById(
            "languageText"
        );


    if (languageText) {

        languageText.innerText =
            newLanguage;

    }


    if (
        typeof showSettingPopup ===
        "function"
    ) {

        showSettingPopup(
            "Language Updated",
            "Language changed to " +
            newLanguage +
            "."
        );

    } else {

        showToast(
            "Language Updated",
            "Language changed to " +
            newLanguage +
            ".",
            "文"
        );

    }

}


document.addEventListener(
    "DOMContentLoaded",
    function() {

        loadWebsiteLanguage();

    }
);


// =====================================================
// PREMIUM CATEGORY SCROLL EFFECT
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    function() {

        const categoryScroll =
            document.querySelector(
                ".category-scroll"
            );


        if (!categoryScroll) return;


        const categoryCards =
            categoryScroll.querySelectorAll(
                ".category-card"
            );


        if (!categoryCards.length) return;


        if (
            typeof IntersectionObserver ===
            "undefined"
        ) {

            return;

        }


        const categoryObserver =
            new IntersectionObserver(
                function(entries) {

                    entries.forEach(
                        function(entry) {

                            if (
                                entry.isIntersecting
                            ) {

                                entry.target.classList.add(
                                    "category-visible"
                                );

                            } else {

                                entry.target.classList.remove(
                                    "category-visible"
                                );

                            }

                        }
                    );

                },
                {
                    root: categoryScroll,
                    threshold: 0.72
                }
            );


        categoryCards.forEach(
            function(card) {

                categoryObserver.observe(
                    card
                );

            }
        );

    }
);


// =====================================================
// PREMIUM TRENDING SHORTS
// MY MARKETPLACE
// =====================================================

// =====================================================
// TRENDING SHORTS
// LOADED FROM ADMIN / SERVER
// =====================================================

const trendingLayers = [

    {
        type: "shorts",

        title: "Trending Shorts",

        label: "WATCH & SHOP",

        shorts: []

    }

];

async function loadPublishedTrendingShorts() {

    try {

        const response = await fetch("/shorts", {
            method: "GET",
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                "Could not load trending shorts"
            );
        }

        const published =
            await response.json();

        if (!Array.isArray(published)) {

            trendingLayers[0].shorts = [];

            return;
        }

        trendingLayers[0].shorts =
            published
            .filter(function(short) {

                return (
                    short &&
                    short.video
                );

            })
            .map(function(short) {

                return {

                    video: short.video,

                    name:
                        short.title ||
                        "Trending Short",

                    product:
                        short.product ||
                        "",

                    productId:
                        short.productId ||
                        ""

                };

            });

    } catch (error) {

        console.error(
            "Trending shorts API error:",
            error
        );

        trendingLayers[0].shorts = [];

    }

}

// =====================================================
// TRENDING VARIABLES
// =====================================================

let currentTrending = 0;

let trendingTimer = null;

let trendingTouchStartX = 0;

let trendingTouchEndX = 0;

// =====================================================
// SHORTS TOUCH CONTROL
// =====================================================

let trendingTouchStartedOnShorts =
    false;


// =====================================================
// OPEN TRENDING PRODUCT
// =====================================================

async function openTrendingProduct(
    productId,
    shortTitle
) {

    try {

        if (!shortTitle) {
            return;
        }

        const response =
            await fetch("/products", {
                method: "GET",
                cache: "no-store"
            });

        if (!response.ok) {
            return;
        }

        const products =
            await response.json();

        if (!Array.isArray(products)) {
            return;
        }

        // =========================================
        // SHORT NAME
        // =========================================

        const shortName =
            String(shortTitle)
                .toLowerCase()
                .trim();

        if (!shortName) {
            return;
        }

        const shortWords =
            shortName
                .replace(
                    /[^a-z0-9\s]/gi,
                    " "
                )
                .split(/\s+/)
                .filter(function(word) {

                    return word.length >= 3;

                });

        // =========================================
        // FIND ALL MATCHING PRODUCTS
        // =========================================

        const matchingProducts =
            products.filter(
                function(product) {

                    if (
                        !product ||
                        !product.id ||
                        !product.name
                    ) {
                        return false;
                    }

                    const productName =
                        String(
                            product.name
                        )
                        .toLowerCase()
                        .trim();

                    const productWords =
                        productName
                            .replace(
                                /[^a-z0-9\s]/gi,
                                " "
                            )
                            .split(/\s+/)
                            .filter(function(word) {

                                return (
                                    word.length >= 3
                                );

                            });

                    return shortWords.some(
                        function(shortWord) {

                            return productWords.some(
                                function(productWord) {

                                    return (
                                        shortWord ===
                                            productWord ||

                                        shortWord.includes(
                                            productWord
                                        ) ||

                                        productWord.includes(
                                            shortWord
                                        )
                                    );

                                }
                            );

                        }
                    );

                }
            );

        // =========================================
        // CHECK LINKED PRODUCT
        // =========================================

        let linkedProduct = null;

        if (productId) {

            linkedProduct =
                products.find(
                    function(product) {

                        return (
                            product &&
                            String(product.id) ===
                            String(productId)
                        );

                    }
                ) || null;

        }

        // =========================================
        // VALID LINKED PRODUCT
        // =========================================

        if (linkedProduct) {

            window.location.href =
                "product.html?productId=" +
                encodeURIComponent(
                    linkedProduct.id
                ) +
                "&trendingName=" +
                encodeURIComponent(
                    shortTitle
                );

            return;

        }

        // =========================================
        // NO LINK + NO MATCH
        // =========================================

        if (
            !matchingProducts.length
        ) {

            console.log(
                "No matching product for Trending Short:",
                shortTitle
            );

            return;

        }

        // =========================================
        // OPEN FIRST MATCH
        // ALL MATCHES WILL BE SHOWN
        // ON PRODUCT PAGE
        // =========================================

        window.location.href =
            "product.html?productId=" +
            encodeURIComponent(
                matchingProducts[0].id
            ) +
            "&trendingName=" +
            encodeURIComponent(
                shortTitle
            );

    } catch (error) {

        console.error(
            "Trending Short product error:",
            error
        );

    }

}

// =====================================================

// RENDER TRENDING SHORTS

// =====================================================

function renderTrending() {

const slider =

document.getElementById(



    "trendingSlider"



);

const dots =

document.getElementById(



    "trendingDots"



);

if (!slider || !dots) return;

const layer =

trendingLayers[



    currentTrending



];

if (!layer) return;

// =================================================

// TRENDING SHORTS ONLY

// =================================================

if (layer.type === "shorts") {

slider.innerHTML = `







    <div



        class="trending-layer trending-shorts-layer"



    >







        <div



            class="trending-shorts-heading"



        >







            <h2>



                ${layer.title}



            </h2>







            <span>



                ${layer.label}



            </span>







        </div>











        <div



            class="trending-shorts-row"



            id="trendingShortsRow"



        >

${layer.shorts
    .map(function(short) {

        return `

            <div

                class="trending-short-card"

                     onclick='
                       openTrendingProduct(
                         ${JSON.stringify(short.productId || "")},
                         ${JSON.stringify(short.name || "")}
                     )
                  '

            >

                <video

                    src="${short.video}"

                    autoplay

                    muted

                    loop

                    playsinline

                    preload="metadata"

                    onerror="
                        if (!this.dataset.loadFailed) {
                            this.dataset.loadFailed = 'true';
                            const card = this.closest('.trending-short-card');
                            if (card) card.style.display = 'none';
                        }

                    "

                ></video>


                <span

                    class="trending-short-play"

                >

                    ▶

                </span>


                <div

                    class="trending-short-info"

                >

                    <small>

                        TRENDING

                    </small>


                    <strong>

                        ${short.name}

                    </strong>

                </div>

            </div>

        `;

    })

    .join("")}





        </div>







    </div>







`;

}

// =================================================

// TRENDING DOTS

// =================================================



dots.innerHTML =

    trendingLayers

        .map(function(item, index) {



            return `



                <button

                    type="button"

                    class="trending-dot ${

                        index === currentTrending

                            ? "active"

                            : ""

                    }"

                    onclick="

                        event.stopPropagation();

                        goToTrending(

                            ${index}

                        );

                    "

                    aria-label="

                        Show trending item

                        ${index + 1}

                    "

                >

                </button>



            `;



        })

        .join("");

    // =================================================
    // PLAY SHORT VIDEOS
    // =================================================

    const videos =
        slider.querySelectorAll(
            "video"
        );


    videos.forEach(
        function(video) {

            video.play().catch(
                function() {

                    // Browser autoplay restriction

                }
            );

        }
    );

}


// =====================================================
// NEXT TRENDING
// =====================================================

function nextTrending() {

    currentTrending++;


    if (
        currentTrending >=
        trendingLayers.length
    ) {

        currentTrending = 0;

    }


    renderTrending();

}


// =====================================================
// PREVIOUS TRENDING
// =====================================================

function previousTrending() {

    currentTrending--;


    if (currentTrending < 0) {

        currentTrending =
            trendingLayers.length - 1;

    }


    renderTrending();

}


// =====================================================
// GO TO TRENDING
// =====================================================

function goToTrending(index) {

    if (
        index < 0 ||
        index >= trendingLayers.length
    ) {

        return;

    }


    currentTrending =
        index;


    renderTrending();

}


// =====================================================
// AUTOMATIC TRENDING
// AUTOMATION DISABLED
// =====================================================

let trendingAutomationStopped = true;

function startTrendingTimer() {

    clearInterval(
        trendingTimer
    );

    trendingTimer = null;

}

function restartTrendingTimer() {

    clearInterval(
        trendingTimer
    );

    trendingTimer = null;

}

// =====================================================
// RESTART TIMER
// =====================================================

function restartTrendingTimer() {

    if (
        trendingAutomationStopped
    ) {

        clearInterval(
            trendingTimer
        );

        trendingTimer = null;

        return;

    }


    startTrendingTimer();

}


// =====================================================
// TRENDING TOUCH / SWIPE
//
// IMPORTANT:
//
// Shorts row = ONLY SHORTS SCROLL
//
// Main Trending area = MAIN TRENDING SWIPE
//
// Shorts touch will NOT trigger
// main Trending movement.
// =====================================================

function setupTrendingSwipe() {

    const slider =
        document.getElementById(
            "trendingSlider"
        );


    if (!slider) return;


    // =================================================
    // TOUCH START
    // =================================================

    slider.addEventListener(
        "touchstart",
        function(event) {

            const shortsRow =
                event.target.closest(
                    ".trending-shorts-row"
                );


            // -----------------------------------------
            // TOUCH STARTED INSIDE SHORTS
            // -----------------------------------------

            if (shortsRow) {

                trendingTouchStartedOnShorts =
                    true;

                return;

            }


            // -----------------------------------------
            // TOUCH STARTED ON MAIN TRENDING
            // -----------------------------------------

            trendingTouchStartedOnShorts =
                false;


            trendingTouchStartX =
                event.changedTouches[0]
                    .screenX;


            /*
             * Main Trending manually touched.
             *
             * Automatic movement permanently stops.
             */

            trendingAutomationStopped =
                true;


            clearInterval(
                trendingTimer
            );


            trendingTimer = null;

        },
        {
            passive: true
        }
    );


    // =================================================
    // TOUCH END
    // =================================================

    slider.addEventListener(
        "touchend",
        function(event) {

            // -----------------------------------------
            // TOUCH BELONGED TO SHORTS
            // -----------------------------------------

            if (
                trendingTouchStartedOnShorts
            ) {

                trendingTouchStartedOnShorts =
                    false;

                return;

            }


            // -----------------------------------------
            // MAIN TRENDING TOUCH
            // -----------------------------------------

            trendingTouchEndX =
                event.changedTouches[0]
                    .screenX;


            const swipeDistance =
                trendingTouchEndX -
                trendingTouchStartX;


            // LEFT SWIPE
            if (
                swipeDistance < -50
            ) {

                nextTrending();

            }


            // RIGHT SWIPE
            if (
                swipeDistance > 50
            ) {

                previousTrending();

            }


            /*
             * Automation does NOT restart
             * after manual interaction.
             */

        },
        {
            passive: true
        }
    );


    // =================================================
    // TOUCH CANCEL
    // =================================================

    slider.addEventListener(
        "touchcancel",
        function() {

            if (
                trendingTouchStartedOnShorts
            ) {

                trendingTouchStartedOnShorts =
                    false;

                return;

            }


            clearInterval(
                trendingTimer
            );


            trendingTimer = null;

        },
        {
            passive: true
        }
    );

}


// =====================================================
// INITIALIZE TRENDING
// ONLY ONE INITIALIZATION
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    async function() {

        renderTrending();

        await loadPublishedTrendingShorts();

        renderTrending();

        setupTrendingSwipe();

        startTrendingTimer();

    }
);


// =====================================================
// GENERAL INITIALIZATION
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    function() {

        updateCounts();

        updateSavedButtons();

        setupPremiumBranding();

    }
);

/* =========================================
   AUTOMATIC PREMIUM BRAND LOGO
========================================= */

function setupPremiumBranding() {

    const brandHTML = `
        <div class="premium-brand">

            <img
                src="./lotus-logo.png"
                alt="My Marketplace"
                class="premium-lotus"
            >

            <div class="premium-brand-text">

                <div class="premium-name">

                    <span class="premium-my">
                        My
                    </span>

                    <span class="premium-marketplace">
                        Marketplace
                    </span>

                </div>

                <div class="premium-line"></div>

            </div>

        </div>
    `;

    const logo =
        document.querySelector(".logo");

    if (
        logo &&
        !logo.querySelector(".premium-brand")
    ) {
        logo.innerHTML = brandHTML;
    }
}