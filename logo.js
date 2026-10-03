/* =========================================
   MY MARKETPLACE - MASTER LOGO SYSTEM
========================================= */

const DEFAULT_MARKETPLACE_LOGO =
    "./lotus-logo.png";

const MARKETPLACE_LOGO_STORAGE_KEY =
    "myMarketplaceLogo";


function getMarketplaceLogo() {

    const savedLogo =
        localStorage.getItem(
            MARKETPLACE_LOGO_STORAGE_KEY
        );

    if (
        savedLogo &&
        savedLogo.trim() !== ""
    ) {
        return savedLogo;
    }

    return DEFAULT_MARKETPLACE_LOGO;
}


function saveMarketplaceLogo(logoData) {

    if (!logoData) {
        return;
    }

    localStorage.setItem(
        MARKETPLACE_LOGO_STORAGE_KEY,
        logoData
    );

    applyMarketplaceLogo();
}


function resetMarketplaceLogo() {

    localStorage.removeItem(
        MARKETPLACE_LOGO_STORAGE_KEY
    );

    applyMarketplaceLogo();

    updateAdminLogoPreview();
}


function setupPremiumBranding() {

    const logo =
        document.querySelector(".logo");

    if (!logo) {
        return;
    }

    const currentLogo =
        getMarketplaceLogo();


    const brandHTML = `
        <div class="premium-brand">

            <img
                src="${currentLogo}"
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


    logo.innerHTML = brandHTML;
}


function applyMarketplaceLogo() {

    const logo =
        document.querySelector(".logo");

    if (!logo) {
        return;
    }

    const currentLogo =
        getMarketplaceLogo();


    const image =
        logo.querySelector(
            ".premium-lotus"
        );


    if (image) {

        image.src =
            currentLogo;

        return;
    }


    setupPremiumBranding();
}


function updateAdminLogoPreview() {

    const preview =
        document.querySelector(
            "#adminLogoPreview img"
        );

    if (!preview) {
        return;
    }

    preview.src =
        getMarketplaceLogo();
}


function changeMarketplaceLogo() {

    const fileInput =
        document.getElementById(
            "adminLogoFile"
        );

    if (!fileInput) {
        return;
    }


    const file =
        fileInput.files &&
        fileInput.files[0];


    if (!file) {

        alert(
            "Please select a logo image first."
        );

        return;
    }


    if (
        !file.type ||
        !file.type.startsWith("image/")
    ) {

        alert(
            "Please select a valid image file."
        );

        return;
    }


    const reader =
        new FileReader();


    reader.onload =
        function(event) {

            const logoData =
                event.target.result;


            saveMarketplaceLogo(
                logoData
            );


            updateAdminLogoPreview();


            fileInput.value = "";


            alert(
                "Logo changed successfully."
            );

        };


    reader.readAsDataURL(file);
}

const marketplaceLanguageText = {
    "Language": "भाषा",
    "Help & Support": "मदद और सहायता",
    "English": "अंग्रेज़ी",
    "Hindi": "हिंदी",
    "Home": "होम",
    "My Account": "मेरा अकाउंट",
    "My Orders": "मेरे ऑर्डर",
    "Settings": "सेटिंग्स",
    "FAQ": "सामान्य प्रश्न",
    "Order Help": "ऑर्डर सहायता",
    "Payment Help": "भुगतान सहायता",
    "Return & Refund Help": "रिटर्न और रिफंड सहायता",
    "Account Help": "अकाउंट सहायता",
    "Contact Support": "सपोर्ट से संपर्क करें"
};

function applySharedLanguage(language) {
    const selectedLanguage = language === "Hindi" ? "Hindi" : "English";

    document.querySelectorAll("body *:not(script):not(style)").forEach(element => {
        if (element.children.length !== 0 || !element.innerText.trim()) return;
        if (!element.dataset.originalText) element.dataset.originalText = element.innerText;

        const originalText = element.dataset.originalText.trim();
        element.innerText = selectedLanguage === "Hindi"
            ? marketplaceLanguageText[originalText] || element.dataset.originalText
            : element.dataset.originalText;
    });

    document.querySelectorAll("input, textarea").forEach(input => {
        if (!input.placeholder) return;
        if (!input.dataset.originalPlaceholder) input.dataset.originalPlaceholder = input.placeholder;
        input.placeholder = selectedLanguage === "Hindi"
            ? marketplaceLanguageText[input.dataset.originalPlaceholder] || input.dataset.originalPlaceholder
            : input.dataset.originalPlaceholder;
    });

    localStorage.setItem("setting_language", selectedLanguage);
    document.documentElement.lang = selectedLanguage === "Hindi" ? "hi" : "en";
}

function openLanguageSelector() {
    if (typeof closeMenu === "function") closeMenu();
    const currentLanguage = localStorage.getItem("setting_language") || "English";
    showMarketplaceModal("Language", `
        <p class="marketplace-modal-copy">Choose your preferred language.</p>
        <div class="language-options">
            <button type="button" class="language-option ${currentLanguage === "English" ? "selected" : ""}" onclick="selectMarketplaceLanguage('English')">English <span>✓</span></button>
            <button type="button" class="language-option ${currentLanguage === "Hindi" ? "selected" : ""}" onclick="selectMarketplaceLanguage('Hindi')">हिंदी <span>✓</span></button>
        </div>
    `);
}

function selectMarketplaceLanguage(language) {
    applySharedLanguage(language);
    closeMarketplaceModal();
    if (typeof showToast === "function") {
        showToast("Language Updated", `Language changed to ${language}.`, "文");
    }
}

function openHelpSupport() {
    if (typeof closeMenu === "function") closeMenu();
    showMarketplaceModal("Help & Support", `
        <div class="support-options">
            <button type="button" onclick="showSupportTopic('FAQ')"><strong>FAQ</strong><span>Find quick answers</span></button>
            <button type="button" onclick="showSupportTopic('Order Help')"><strong>Order Help</strong><span>Track, change or cancel an order</span></button>
            <button type="button" onclick="showSupportTopic('Payment Help')"><strong>Payment Help</strong><span>Payment and Cash on Delivery</span></button>
            <button type="button" onclick="showSupportTopic('Return & Refund Help')"><strong>Return & Refund Help</strong><span>Returns, refunds and exchanges</span></button>
            <button type="button" onclick="showSupportTopic('Account Help')"><strong>Account Help</strong><span>Login, profile and saved data</span></button>
            <button type="button" onclick="contactMarketplaceSupport()"><strong>Contact Support</strong><span>support@mymarketplace.local</span></button>
        </div>
    `);
}

function openDeliveryLocation() {
    const currentLocation = localStorage.getItem("delivery_location") || "Your Location";
    showMarketplaceModal("Delivery Location", `<p class="marketplace-modal-copy">Choose where you want your order delivered.</p><input class="marketplace-location-input" id="deliveryLocationInput" type="text" value="${currentLocation.replace(/"/g, "&quot;")}" maxlength="80" placeholder="Enter city or area"><button type="button" class="modal-primary-button" onclick="saveDeliveryLocation()">Save Location</button>`);
}

function saveDeliveryLocation() {
    const input = document.getElementById("deliveryLocationInput");
    const location = input?.value.trim();
    if (!location) return;
    localStorage.setItem("delivery_location", location);
    document.querySelector(".location-left strong")?.replaceChildren(document.createTextNode(location));
    closeMarketplaceModal();
    if (typeof showToast === "function") showToast("Delivery Location", "Location saved successfully.", "📍");
}

function showSupportTopic(topic) {
    const answers = {
        "FAQ": "Browse products by category, save favourites in Wishlist, and track placed orders from My Orders.",
        "Order Help": "Open My Orders to view status. Orders are saved on this device after checkout.",
        "Payment Help": "Cash on Delivery is available when enabled by the administrator. Payment status appears with your order.",
        "Return & Refund Help": "Contact support with your order number and reason. Our team will guide the return and refund process.",
        "Account Help": "Use Account to log in or create a profile. Settings lets you manage saved local preferences."
    };
    showMarketplaceModal(topic, `<p class="marketplace-modal-copy">${answers[topic] || "Please contact support for assistance."}</p><button type="button" class="modal-primary-button" onclick="openHelpSupport()">Back to Help</button>`);
}

function contactMarketplaceSupport() {
    window.location.href = "mailto:support@mymarketplace.local?subject=My%20Marketplace%20Support";
}

function openMarketplaceInfo(topic) {
    const information = {
        "Return Policy": "Returns and refunds are handled case by case. Keep your order number and contact support with the reason for your request.",
        "Privacy Policy": "Marketplace preferences, cart, wishlist and account data are stored locally on this device. Admin data is stored by the local server.",
        "Terms & Conditions": "Orders are confirmed after you submit valid delivery details. Product availability and delivery timing may vary by order."
    };

    showMarketplaceModal(
        topic,
        `<p class="marketplace-modal-copy">${information[topic] || "Please contact support for more information."}</p>`
    );
}

function showMarketplaceModal(title, content) {
    closeMarketplaceModal();
    const modal = document.createElement("div");
    modal.className = "marketplace-modal-backdrop";
    modal.id = "marketplaceModal";
    modal.innerHTML = `<section class="marketplace-modal" role="dialog" aria-modal="true" aria-labelledby="marketplaceModalTitle"><button type="button" class="marketplace-modal-close" aria-label="Close" onclick="closeMarketplaceModal()">×</button><h2 id="marketplaceModalTitle">${title}</h2><div class="marketplace-modal-body">${content}</div></section>`;
    modal.addEventListener("click", event => {
        if (event.target === modal) closeMarketplaceModal();
    });
    document.body.appendChild(modal);
}

function closeMarketplaceModal() {
    document.getElementById("marketplaceModal")?.remove();
}

document.addEventListener("DOMContentLoaded", function() {
    applySharedLanguage(localStorage.getItem("setting_language") || "English");
    window.setTimeout(function() {
        const savedLocation = localStorage.getItem("delivery_location");
        if (savedLocation) {
            document.querySelector(".location-left strong")?.replaceChildren(document.createTextNode(savedLocation));
        }
    }, 0);
});


document.addEventListener(
    "DOMContentLoaded",
    function() {

        setupPremiumBranding();

        updateAdminLogoPreview();

    }
);