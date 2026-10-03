const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const storage = require("./storage");

const productsFile = path.join(__dirname, "products.json");
const ordersFile = path.join(__dirname, "orders.json");
const shortsFile = path.join(__dirname, "shorts.json");
const reviewsFile = path.join(__dirname, "reviews.json");
const sellersFile = path.join(__dirname, "sellers.json");
const categoriesFile = path.join(__dirname, "categories.json");
const couponsFile = path.join(__dirname, "coupons.json");
const promotionFile = path.join(__dirname, "promotion.json");
const notificationsFile = path.join(__dirname, "notifications.json");

const projectFolder = path.join(__dirname, "..");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (
    IS_PRODUCTION &&
    (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)
) {
    throw new Error(
        "ADMIN_USERNAME and ADMIN_PASSWORD must be set when NODE_ENV=production"
    );
}

const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;
const adminSessions = new Map();
const sellerSessions = new Map();

const ORDER_STATUSES = [
    "Order Placed", "Confirmed", "Packed", "Shipped",
    "Out for Delivery", "Delivered", "Cancelled", "Returned / Refunded"
];

const PAYMENT_STATUSES = [
    "Pending", "Pending Verification", "Paid", "Failed", "Refunded"
];

function readJSONFile(file, fallback, callback) {
    if (storage.isEnabled()) {
        storage.read(path.basename(file), fallback, callback);
        return;
    }

    fs.readFile(file, "utf8", (error, data) => {
        if (error && error.code === "ENOENT") {
            callback(null, fallback);
            return;
        }
        if (error) {
            callback(error, null);
            return;
        }
        try {
            const parsed = data.trim() ? JSON.parse(data) : fallback;
            callback(null, parsed === undefined || parsed === null ? fallback : parsed);
        } catch (parseError) {
            callback(parseError, null);
        }
    });
}

function saveJSONFile(file, value, callback) {
    if (storage.isEnabled()) {
        storage.write(path.basename(file), value, callback);
        return;
    }

    fs.writeFile(file, JSON.stringify(value, null, 4), "utf8", callback);
}

function hashPassword(password) {
    return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

function getSellerSessionToken(req) {
    return parseCookies(req.headers.cookie || "").myMarketplaceSellerSession || "";
}

function getSellerSession(req) {
    const token = getSellerSessionToken(req);
    const session = sellerSessions.get(token);
    if (!session || Date.now() - session.createdAt > ADMIN_SESSION_TTL) {
        if (token) sellerSessions.delete(token);
        return null;
    }
    return session;
}

function setSellerSessionCookie(token) {
    return `myMarketplaceSellerSession=${token}; Path=/; HttpOnly; SameSite=Lax${IS_PRODUCTION ? "; Secure" : ""}; Max-Age=${Math.floor(ADMIN_SESSION_TTL / 1000)}`;
}

function clearSellerSessionCookie() {
    return "myMarketplaceSellerSession=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function addNotification(audience, message, type, referenceId, callback) {
    readJSONFile(notificationsFile, [], (error, notifications) => {
        if (error) {
            callback(error);
            return;
        }
        notifications.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            audience,
            message,
            type: type || "info",
            referenceId: referenceId || "",
            read: false,
            createdAt: new Date().toISOString()
        });
        saveJSONFile(notificationsFile, notifications, callback);
    });
}


// =====================================================
// HELPER: SEND JSON RESPONSE
// =====================================================

function sendJSON(res, statusCode, data) {

    res.writeHead(statusCode, {
        "Content-Type":
            "application/json; charset=utf-8",

        "Access-Control-Allow-Origin": "*"
    });

    res.end(
        JSON.stringify(data)
    );
}


function sendJSONWithCookies(
    res,
    statusCode,
    data,
    cookies = []
) {

    const headers = {
        "Content-Type":
            "application/json; charset=utf-8",

        "Access-Control-Allow-Origin": "*"
    };

    if (cookies.length > 0) {
        headers["Set-Cookie"] = cookies;
    }

    res.writeHead(statusCode, headers);

    res.end(
        JSON.stringify(data)
    );
}


// =====================================================
// HELPER: SEND TEXT RESPONSE
// =====================================================

function sendText(
    res,
    statusCode,
    message
) {

    res.writeHead(statusCode, {
        "Content-Type":
            "text/plain; charset=utf-8",

        "Access-Control-Allow-Origin": "*"
    });

    res.end(message);
}


// =====================================================
// HELPER: READ REQUEST BODY
// =====================================================

function readBody(
    req,
    callback
) {

    let body = "";
    const maxBodySize = 40 * 1024 * 1024;
    let rejected = false;

    req.on(
        "data",
        chunk => {

            if (rejected) return;

            body += chunk;

            if (Buffer.byteLength(body, "utf8") > maxBodySize) {
                rejected = true;
                callback(
                    Object.assign(
                        new Error("Request body is too large"),
                        { code: "PAYLOAD_TOO_LARGE" }
                    ),
                    null
                );
                req.resume();
            }

        }
    );

    req.on(
        "end",
        () => {

            if (rejected) return;

            try {

                const data =
                    body
                        ? JSON.parse(body)
                        : {};

                callback(
                    null,
                    data
                );

            }
            catch (error) {

                callback(
                    error,
                    null
                );

            }

        }
    );

}


function parseCookies(cookieHeader = "") {

    const result = {};

    if (!cookieHeader) {
        return result;
    }

    cookieHeader
        .split(";")
        .forEach(cookie => {

            const trimmed = cookie.trim();

            if (!trimmed) {
                return;
            }

            const separatorIndex = trimmed.indexOf("=");

            if (separatorIndex === -1) {
                return;
            }

            const key = trimmed.slice(0, separatorIndex).trim();
            const value = trimmed.slice(separatorIndex + 1).trim();

            result[key] = value;

        });

    return result;
}


function generateAdminSessionToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");

}


function getAdminSessionToken(req) {

    const cookies = parseCookies(
        req.headers.cookie || ""
    );

    return cookies.myMarketplaceAdminSession || "";

}


function isAdminAuthenticated(req) {

    const token = getAdminSessionToken(req);

    if (!token) {
        return false;
    }

    const session = adminSessions.get(token);

    if (!session) {
        return false;
    }

    if (Date.now() - session.createdAt > ADMIN_SESSION_TTL) {
        adminSessions.delete(token);
        return false;
    }

    return true;

}


function requireAdmin(req, res, next) {

    if (!isAdminAuthenticated(req)) {

        sendJSON(
            res,
            401,
            {
                success: false,
                message: "Unauthorized"
            }
        );

        return;
    }

    next();

}


function setAdminSessionCookie(res, token) {

    const sessionCookie =
        `myMarketplaceAdminSession=${token}; Path=/; HttpOnly; SameSite=Lax${IS_PRODUCTION ? "; Secure" : ""}; Max-Age=${Math.floor(ADMIN_SESSION_TTL / 1000)}`;

    return sessionCookie;

}


function clearAdminSessionCookie() {

    return "myMarketplaceAdminSession=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";

}


// =====================================================
// PRODUCTS
// =====================================================

function readProducts(callback) {
    readJSONFile(productsFile, [], (error, products) => {
        if (error) {
            callback(error, null);
            return;
        }
        callback(null, Array.isArray(products) ? products : []);
    });
}


function saveProducts(
    products,
    callback
) {
    saveJSONFile(productsFile, products, callback);
}

function normalizeProductFlags(product = {}) {
    if (!product || typeof product !== "object") {
        return product;
    }

    return {
        ...product,
        featured: Boolean(product.featured),
        bestSeller: Boolean(product.bestSeller),
        newArrival: Boolean(product.newArrival),
        topRated: Boolean(product.topRated),
        specialOffer: Boolean(product.specialOffer),
        homepageVisible: product.homepageVisible === undefined ? false : Boolean(product.homepageVisible),
        condition: product.condition || "New",
        category: product.category || "Other"
    };
}


// =====================================================
// ORDERS
// =====================================================

function readOrders(callback) {
    readJSONFile(ordersFile, [], (error, orders) => {
        if (error) {
            callback(error, null);
            return;
        }
        callback(null, Array.isArray(orders) ? orders : []);
    });
}


function saveOrders(
    orders,
    callback
) {
    saveJSONFile(ordersFile, orders, callback);
}


// =====================================================
// TRENDING SHORTS
// =====================================================

function readShorts(callback) {
    readJSONFile(shortsFile, [], (error, shorts) => {
        if (error) {
            callback(error, []);
            return;
        }
        callback(null, Array.isArray(shorts) ? shorts : []);
    });
}


function saveShorts(
    shorts,
    callback
) {
    saveJSONFile(shortsFile, shorts, callback);
}


// =====================================================
// TRENDING VIDEO EXISTENCE CHECK
// =====================================================

function checkVideoExists(
    videoPath
) {

    if (
        typeof videoPath !==
        "string"
    ) {

        return false;

    }


    const cleanPath =
        videoPath
            .trim();


    if (!cleanPath) {

        return false;

    }


    /*
     * Data URL videos are already
     * available inside shorts.json.
     */

    if (
        cleanPath.startsWith(
            "data:video/"
        )
    ) {

        return true;

    }


    /*
     * Only check local video
     * files inside the project.
     */

    const normalized =
        cleanPath
            .replace(/^[/\\]+/, "")
            .replace(
                /\//g,
                path.sep
            );


    const videoFile =
        path.resolve(
            projectFolder,
            normalized
        );


    const projectRoot =
        path.resolve(
            projectFolder
        );


    if (
        !videoFile.startsWith(
            projectRoot +
            path.sep
        )
    ) {

        return false;

    }


    try {

        return fs.statSync(
            videoFile
        ).isFile();

    }
    catch (error) {

        return false;

    }

}


// =====================================================
// SERVER
// =====================================================

const server =
    http.createServer(
        (req, res) => {


            // =================================================
            // CORS / OPTIONS
            // =================================================

            if (
                req.method ===
                "OPTIONS"
            ) {

                res.writeHead(
                    204,
                    {
                        "Access-Control-Allow-Origin":
                            "*",

                        "Access-Control-Allow-Methods":
                            "GET, POST, PUT, DELETE, OPTIONS",

                        "Access-Control-Allow-Headers":
                            "Content-Type"
                    }
                );

                res.end();

                return;

            }


            if (
                req.method ===
                    "POST" &&
                req.url ===
                    "/admin-login"
            ) {

                readBody(
                    req,
                    (
                        error,
                        loginData
                    ) => {

                        if (
                            error ||
                            !loginData ||
                            typeof loginData !== "object"
                        ) {

                            sendJSON(
                                res,
                                400,
                                {
                                    success: false,
                                    message: "Invalid login data"
                                }
                            );

                            return;
                        }

                        const username = String(
                            loginData.username || ""
                        );

                        const password = String(
                            loginData.password || ""
                        );

                        if (
                            !ADMIN_PASSWORD ||
                            username !== ADMIN_USERNAME ||
                            password !== ADMIN_PASSWORD
                        ) {

                            sendJSON(
                                res,
                                401,
                                {
                                    success: false,
                                    message: "Wrong username or password"
                                }
                            );

                            return;
                        }

                        const token = generateAdminSessionToken();

                        adminSessions.set(token, {
                            username: ADMIN_USERNAME,
                            createdAt: Date.now()
                        });

                        sendJSONWithCookies(
                            res,
                            200,
                            {
                                success: true,
                                message: "Admin login successful"
                            },
                            [
                                setAdminSessionCookie(res, token)
                            ]
                        );

                        return;
                    }
                );

                return;
            }


            if (
                req.method ===
                    "POST" &&
                req.url ===
                    "/admin-logout"
            ) {

                const token = getAdminSessionToken(req);

                if (token) {
                    adminSessions.delete(token);
                }

                sendJSONWithCookies(
                    res,
                    200,
                    {
                        success: true,
                        message: "Admin logged out"
                    },
                    [
                        clearAdminSessionCookie()
                    ]
                );

                return;
            }


            if (
                req.method ===
                    "GET" &&
                req.url ===
                    "/admin-session"
            ) {

                if (!isAdminAuthenticated(req)) {

                    sendJSON(
                        res,
                        401,
                        {
                            success: false,
                            authenticated: false
                        }
                    );

                    return;
                }

                sendJSON(
                    res,
                    200,
                    {
                        success: true,
                        authenticated: true
                    }
                );

                return;
            }


            // =================================================
            // ADD PRODUCT
            // POST /add-product
            // =================================================

            if (
                req.method ===
                    "POST" &&
                req.url ===
                    "/add-product"
            ) {

                if (!isAdminAuthenticated(req)) {

                    sendJSON(
                        res,
                        401,
                        {
                            success: false,
                            message: "Unauthorized"
                        }
                    );

                    return;
                }

                readBody(
                    req,
                    (
                        error,
                        product
                    ) => {

                        if (error) {

                            sendJSON(
                                res,
                                400,
                                {
                                    success:
                                        false,

                                    message:
                                        "Invalid product data"
                                }
                            );

                            return;

                        }


                        if (
                            !product.name
                        ) {

                            sendJSON(
                                res,
                                400,
                                {
                                    success:
                                        false,

                                    message:
                                        "Product name is required"
                                }
                            );

                            return;

                        }


                        readProducts(
                            (
                                readError,
                                products
                            ) => {

                                if (
                                    readError
                                ) {

                                    sendJSON(
                                        res,
                                        500,
                                        {
                                            success:
                                                false,

                                            message:
                                                "Products could not be read"
                                        }
                                    );

                                    return;

                                }


                                const newProduct =
                                    normalizeProductFlags({

                                        id:
                                            Date.now(),

                                        name:
                                            product.name,

                                        price:
                                            product.price ||
                                            0,

                                        description:
                                            product.description ||
                                            "",

                                        category:
                                            product.category ||
                                            "",

                                        images:
                                            Array.isArray(
                                                product.images
                                            )
                                                ? product.images
                                                : [],

                                        variants:
                                            Array.isArray(
                                                product.variants
                                            )
                                                ? product.variants
                                                : [],

                                        stock:
                                            product.stock ||
                                            0,

                                        condition:
                                            product.condition ||
                                            "New",

                                        featured:
                                            Boolean(product.featured),

                                        bestSeller:
                                            Boolean(product.bestSeller),

                                        newArrival:
                                            Boolean(product.newArrival),

                                        topRated:
                                            Boolean(product.topRated),

                                        specialOffer:
                                            Boolean(product.specialOffer),

                                        homepageVisible:
                                            product.homepageVisible === undefined
                                                ? false
                                                : Boolean(product.homepageVisible),

                                        createdAt:
                                            new Date()
                                                .toISOString()

                                    });


                                products.push(
                                    newProduct
                                );


                                saveProducts(
                                    products,
                                    writeError => {

                                        if (
                                            writeError
                                        ) {

                                            sendJSON(
                                                res,
                                                500,
                                                {
                                                    success:
                                                        false,

                                                    message:
                                                        "Product could not be saved"
                                                }
                                            );

                                            return;

                                        }


                                        sendJSON(
                                            res,
                                            200,
                                            {
                                                success:
                                                    true,

                                                message:
                                                    "Product added successfully",

                                                product:
                                                    newProduct
                                            }
                                        );

                                    }
                                );

                            }
                        );

                    }
                );

                return;

            }


            // =================================================
            // GET ALL PRODUCTS
            // GET /products
            // =================================================

            if (
                req.method ===
                    "GET" &&
                req.url.startsWith(
                    "/products"
                )
            ) {

                const requestURL =
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    );

                readProducts(
                    (
                        error,
                        products
                    ) => {

                        if (
                            error
                        ) {

                            sendJSON(
                                res,
                                500,
                                {
                                    success:
                                        false,

                                    products:
                                        []
                                }
                            );

                            return;

                        }

                        const normalizedProducts =
                            products.map(
                                normalizeProductFlags
                            );

                        const q = String(
                            requestURL.searchParams.get("q") || ""
                        ).trim().toLowerCase();

                        const featured = requestURL.searchParams.get("featured");
                        const bestSeller = requestURL.searchParams.get("bestSeller");
                        const newArrival = requestURL.searchParams.get("newArrival");
                        const topRated = requestURL.searchParams.get("topRated");
                        const specialOffer = requestURL.searchParams.get("specialOffer");
                        const homepageVisible = requestURL.searchParams.get("homepageVisible");
                        const category = String(requestURL.searchParams.get("category") || "").trim();
                        const minRating = Number(requestURL.searchParams.get("minRating") || 0);
                        const availability = requestURL.searchParams.get("availability");
                        const condition = String(requestURL.searchParams.get("condition") || "").trim();

                        let filteredProducts = normalizedProducts.filter(product => {
                            if (featured !== null && Boolean(product.featured) !== (featured === "true" || featured === "1")) {
                                return false;
                            }
                            if (bestSeller !== null && Boolean(product.bestSeller) !== (bestSeller === "true" || bestSeller === "1")) {
                                return false;
                            }
                            if (newArrival !== null && Boolean(product.newArrival) !== (newArrival === "true" || newArrival === "1")) {
                                return false;
                            }
                            if (topRated !== null && Boolean(product.topRated) !== (topRated === "true" || topRated === "1")) {
                                return false;
                            }
                            if (specialOffer !== null && Boolean(product.specialOffer) !== (specialOffer === "true" || specialOffer === "1")) {
                                return false;
                            }
                            if (homepageVisible !== null && Boolean(product.homepageVisible) !== (homepageVisible === "true" || homepageVisible === "1")) {
                                return false;
                            }
                            if (category && !String(product.category || "").toLowerCase().includes(category.toLowerCase())) {
                                return false;
                            }
                            if (q) {
                                const haystack = [
                                    product.name,
                                    product.category,
                                    product.description,
                                    product.condition,
                                    String(product.brand || "")
                                ].join(" ").toLowerCase();
                                if (!haystack.includes(q)) {
                                    return false;
                                }
                            }
                            if (minRating > 0) {
                                const rating = Number(product.averageRating || product.rating || 0);
                                if (rating < minRating) {
                                    return false;
                                }
                            }
                            if (availability === "available" && Number(product.stock || 0) <= 0) {
                                return false;
                            }
                            if (availability === "out" && Number(product.stock || 0) > 0) {
                                return false;
                            }
                            if (condition && String(product.condition || "").toLowerCase() !== condition.toLowerCase()) {
                                return false;
                            }
                            return true;
                        });

                        const sort = requestURL.searchParams.get("sort") || "newest";

                        if (sort === "low") {
                            filteredProducts = filteredProducts.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
                        } else if (sort === "high") {
                            filteredProducts = filteredProducts.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
                        } else if (sort === "rating") {
                            filteredProducts = filteredProducts.sort((a, b) => Number(b.averageRating || b.rating || 0) - Number(a.averageRating || a.rating || 0));
                        } else {
                            filteredProducts = filteredProducts.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
                        }

                        sendJSON(
                            res,
                            200,
                            filteredProducts
                        );

                    }
                );

                return;

            }


            // =================================================
            // GET SINGLE PRODUCT
            // GET /product?id=123
            // =================================================

            if (
                req.method ===
                    "GET" &&
                req.url.startsWith(
                    "/product?"
                )
            ) {

                const requestURL =
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    );


                const productId =
                    Number(
                        requestURL
                            .searchParams
                            .get("id")
                    );


                if (
                    !productId
                ) {

                    sendJSON(
                        res,
                        400,
                        {
                            success:
                                false,

                            message:
                                "Product ID is required"
                        }
                    );

                    return;

                }


                readProducts(
                    (
                        error,
                        products
                    ) => {

                        if (
                            error
                        ) {

                            sendJSON(
                                res,
                                500,
                                {
                                    success:
                                        false,

                                    message:
                                        "Products could not be read"
                                }
                            );

                            return;

                        }


                        const product =
                            products.find(
                                item =>
                                    Number(
                                        item.id
                                    ) ===
                                    productId
                            );


                        if (
                            !product
                        ) {

                            sendJSON(
                                res,
                                404,
                                {
                                    success:
                                        false,

                                    message:
                                        "Product not found"
                                }
                            );

                            return;

                        }


                        sendJSON(
                            res,
                            200,
                            product
                        );

                    }
                );

                return;

            }


            // =================================================
            // UPDATE PRODUCT
            // PUT /update-product?id=123
            // =================================================

            if (
                req.method ===
                    "PUT" &&
                req.url.startsWith(
                    "/update-product?"
                )
            ) {

                if (!isAdminAuthenticated(req)) {

                    sendJSON(
                        res,
                        401,
                        {
                            success: false,
                            message: "Unauthorized"
                        }
                    );

                    return;
                }

                const requestURL =
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    );


                const productId =
                    Number(
                        requestURL
                            .searchParams
                            .get("id")
                    );


                if (
                    !productId
                ) {

                    sendJSON(
                        res,
                        400,
                        {
                            success:
                                false,

                            message:
                                "Product ID is required"
                        }
                    );

                    return;

                }


                readBody(
                    req,
                    (
                        error,
                        updatedData
                    ) => {

                        if (
                            error
                        ) {

                            sendJSON(
                                res,
                                400,
                                {
                                    success:
                                        false,

                                    message:
                                        "Invalid product data"
                                }
                            );

                            return;

                        }


                        readProducts(
                            (
                                readError,
                                products
                            ) => {

                                if (
                                    readError
                                ) {

                                    sendJSON(
                                        res,
                                        500,
                                        {
                                            success:
                                                false,

                                            message:
                                                "Products could not be read"
                                        }
                                    );

                                    return;

                                }


                                const index =
                                    products.findIndex(
                                        item =>
                                            Number(
                                                item.id
                                            ) ===
                                            productId
                                    );


                                if (
                                    index ===
                                    -1
                                ) {

                                    sendJSON(
                                        res,
                                        404,
                                        {
                                            success:
                                                false,

                                            message:
                                                "Product not found"
                                        }
                                    );

                                    return;

                                }


                                products[index] =
                                    normalizeProductFlags({

                                        ...products[index],

                                        ...updatedData,

                                        id:
                                            products[index]
                                                .id,

                                        condition:
                                            updatedData.condition ||
                                            products[index].condition ||
                                            "New",

                                        featured:
                                            updatedData.featured !== undefined
                                                ? Boolean(updatedData.featured)
                                                : Boolean(products[index].featured),

                                        bestSeller:
                                            updatedData.bestSeller !== undefined
                                                ? Boolean(updatedData.bestSeller)
                                                : Boolean(products[index].bestSeller),

                                        newArrival:
                                            updatedData.newArrival !== undefined
                                                ? Boolean(updatedData.newArrival)
                                                : Boolean(products[index].newArrival),

                                        topRated:
                                            updatedData.topRated !== undefined
                                                ? Boolean(updatedData.topRated)
                                                : Boolean(products[index].topRated),

                                        specialOffer:
                                            updatedData.specialOffer !== undefined
                                                ? Boolean(updatedData.specialOffer)
                                                : Boolean(products[index].specialOffer),

                                        homepageVisible:
                                            updatedData.homepageVisible !== undefined
                                                ? Boolean(updatedData.homepageVisible)
                                                : Boolean(products[index].homepageVisible),

                                        updatedAt:
                                            new Date()
                                                .toISOString()

                                    });


                                saveProducts(
                                    products,
                                    writeError => {

                                        if (
                                            writeError
                                        ) {

                                            sendJSON(
                                                res,
                                                500,
                                                {
                                                    success:
                                                        false,

                                                    message:
                                                        "Product could not be updated"
                                                }
                                            );

                                            return;

                                        }


                                        sendJSON(
                                            res,
                                            200,
                                            {
                                                success:
                                                    true,

                                                message:
                                                    "Product updated successfully",

                                                product:
                                                    products[index]
                                            }
                                        );

                                    }
                                );

                            }
                        );

                    }
                );

                return;

            }


            // =================================================
            // DELETE PRODUCT
            // DELETE /delete-product?id=123
            // =================================================

            if (
                req.method ===
                    "DELETE" &&
                req.url.startsWith(
                    "/delete-product?"
                )
            ) {

                if (!isAdminAuthenticated(req)) {

                    sendJSON(
                        res,
                        401,
                        {
                            success: false,
                            message: "Unauthorized"
                        }
                    );

                    return;
                }

                const requestURL =
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    );


                const productId =
                    Number(
                        requestURL
                            .searchParams
                            .get("id")
                    );


                if (
                    !productId
                ) {

                    sendJSON(
                        res,
                        400,
                        {
                            success:
                                false,

                            message:
                                "Product ID is required"
                        }
                    );

                    return;

                }


                readProducts(
                    (
                        readError,
                        products
                    ) => {

                        if (
                            readError
                        ) {

                            sendJSON(
                                res,
                                500,
                                {
                                    success:
                                        false,

                                    message:
                                        "Products could not be read"
                                }
                            );

                            return;

                        }


                        const index =
                            products.findIndex(
                                item =>
                                    Number(
                                        item.id
                                    ) ===
                                    productId
                            );


                        if (
                            index ===
                            -1
                        ) {

                            sendJSON(
                                res,
                                404,
                                {
                                    success:
                                        false,

                                    message:
                                        "Product not found"
                                }
                            );

                            return;

                        }


                        const deletedProduct =
                            products[index];


                        products.splice(
                            index,
                            1
                        );


                        saveProducts(
                            products,
                            writeError => {

                                if (
                                    writeError
                                ) {

                                    sendJSON(
                                        res,
                                        500,
                                        {
                                            success:
                                                false,

                                            message:
                                                "Product could not be deleted"
                                        }
                                    );

                                    return;

                                }


                                sendJSON(
                                    res,
                                    200,
                                    {
                                        success:
                                            true,

                                        message:
                                            "Product deleted successfully",

                                        product:
                                            deletedProduct
                                    }
                                );

                            }
                        );

                    }
                );

                return;

            }


            // =================================================
            // PLACE ORDER
            // POST /place-order
            // =================================================

            if (req.method === "POST" && req.url === "/seller-register") {
                readBody(req, (error, data) => {
                    const name = String(data?.name || "").trim();
                    const email = String(data?.email || "").trim().toLowerCase();
                    const password = String(data?.password || "");
                    if (error || !name || !email || password.length < 6) {
                        sendJSON(res, 400, { success: false, message: "Name, email and a 6-character password are required" });
                        return;
                    }
                    readJSONFile(sellersFile, [], (readError, sellers) => {
                        if (readError) {
                            sendJSON(res, 500, { success: false, message: "Sellers could not be read" });
                            return;
                        }
                        if (sellers.some(seller => seller.email === email)) {
                            sendJSON(res, 409, { success: false, message: "A seller with this email already exists" });
                            return;
                        }
                        const seller = {
                            id: "SEL" + Date.now(), name, email,
                            phone: String(data.phone || "").trim(),
                            passwordHash: hashPassword(password), status: "Pending",
                            createdAt: new Date().toISOString()
                        };
                        sellers.push(seller);
                        saveJSONFile(sellersFile, sellers, writeError => {
                            if (writeError) {
                                sendJSON(res, 500, { success: false, message: "Seller registration failed" });
                                return;
                            }
                            addNotification("admin", `Seller registration pending: ${seller.name}`, "seller", seller.id, () => {});
                            sendJSON(res, 201, { success: true, message: "Registration submitted for admin approval", seller: { id: seller.id, name: seller.name, email: seller.email, status: seller.status } });
                        });
                    });
                });
                return;
            }

            if (req.method === "POST" && req.url === "/seller-login") {
                readBody(req, (error, data) => {
                    readJSONFile(sellersFile, [], (readError, sellers) => {
                        const seller = sellers.find(item => item.email === String(data?.email || "").trim().toLowerCase());
                        if (error || readError || !seller || seller.passwordHash !== hashPassword(data?.password || "")) {
                            sendJSON(res, 401, { success: false, message: "Invalid seller credentials" });
                            return;
                        }
                        if (seller.status !== "Approved") {
                            sendJSON(res, 403, { success: false, message: `Seller account is ${seller.status.toLowerCase()}` });
                            return;
                        }
                        const token = generateSessionToken();
                        sellerSessions.set(token, { sellerId: seller.id, createdAt: Date.now() });
                        sendJSONWithCookies(res, 200, { success: true, seller: { id: seller.id, name: seller.name, email: seller.email } }, [setSellerSessionCookie(token)]);
                    });
                });
                return;
            }

            if (req.method === "POST" && req.url === "/seller-logout") {
                sellerSessions.delete(getSellerSessionToken(req));
                sendJSONWithCookies(res, 200, { success: true }, [clearSellerSessionCookie()]);
                return;
            }

            if (req.method === "GET" && req.url === "/seller-session") {
                const session = getSellerSession(req);
                sendJSON(res, session ? 200 : 401, session ? { success: true, sellerId: session.sellerId } : { success: false });
                return;
            }

            if (req.method === "GET" && req.url === "/admin-sellers") {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                readJSONFile(sellersFile, [], (error, sellers) => {
                    sendJSON(res, error ? 500 : 200, error ? { success: false, sellers: [] } : sellers.map(({ passwordHash, ...seller }) => seller));
                });
                return;
            }

            if (req.method === "PUT" && req.url.startsWith("/admin-seller-status?")) {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                const sellerId = requestURL.searchParams.get("id");
                readBody(req, (error, data) => {
                    const statuses = ["Pending", "Approved", "Rejected", "Inactive"];
                    if (error || !statuses.includes(data?.status)) {
                        sendJSON(res, 400, { success: false, message: "Invalid seller status" });
                        return;
                    }
                    readJSONFile(sellersFile, [], (readError, sellers) => {
                        const seller = sellers.find(item => item.id === sellerId);
                        if (readError || !seller) {
                            sendJSON(res, 404, { success: false, message: "Seller not found" });
                            return;
                        }
                        seller.status = data.status;
                        saveJSONFile(sellersFile, sellers, writeError => {
                            if (writeError) {
                                sendJSON(res, 500, { success: false, message: "Seller could not be updated" });
                                return;
                            }
                            addNotification(`seller:${seller.id}`, `Your seller account is ${seller.status}`, "seller", seller.id, () => {});
                            sendJSON(res, 200, { success: true, seller: { id: seller.id, name: seller.name, status: seller.status } });
                        });
                    });
                });
                return;
            }

            if (req.method === "POST" && req.url === "/seller-products") {
                const session = getSellerSession(req);
                if (!session) {
                    sendJSON(res, 401, { success: false, message: "Seller login required" });
                    return;
                }
                readBody(req, (error, data) => {
                    if (error || !String(data?.name || "").trim() || Number(data.price) < 0 || Number(data.stock) < 0) {
                        sendJSON(res, 400, { success: false, message: "Valid product name, price and stock are required" });
                        return;
                    }
                    readProducts((readError, products) => {
                        const product = {
                            id: Date.now(), name: String(data.name).trim(), price: Number(data.price),
                            description: String(data.description || ""), category: String(data.category || ""),
                            condition: String(data.condition || "New"), images: Array.isArray(data.images) ? data.images : [],
                            variants: Array.isArray(data.variants) ? data.variants : [], stock: Number(data.stock),
                            sellerId: session.sellerId, createdAt: new Date().toISOString()
                        };
                        if (readError) {
                            sendJSON(res, 500, { success: false, message: "Products could not be read" });
                            return;
                        }
                        products.push(product);
                        saveProducts(products, writeError => sendJSON(res, writeError ? 500 : 201, writeError ? { success: false, message: "Product could not be saved" } : { success: true, product }));
                    });
                });
                return;
            }

            if (req.method === "GET" && req.url === "/seller-dashboard") {
                const session = getSellerSession(req);
                if (!session) {
                    sendJSON(res, 401, { success: false, message: "Seller login required" });
                    return;
                }
                readProducts((productsError, products) => readOrders((ordersError, orders) => {
                    const ownProducts = products.filter(product => product.sellerId === session.sellerId);
                    const ownOrders = orders.filter(order => (order.products || []).some(item => item.sellerId === session.sellerId));
                    const earnings = ownOrders.reduce((sum, order) => sum + (order.products || []).filter(item => item.sellerId === session.sellerId).reduce((lineSum, item) => lineSum + Number(item.price || 0) * Number(item.quantity || 0), 0), 0);
                    sendJSON(res, productsError || ordersError ? 500 : 200, { success: !productsError && !ordersError, products: ownProducts, orders: ownOrders, earnings });
                }));
                return;
            }

            if (req.method === "GET" && req.url.startsWith("/reviews?")) {
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                const productId = requestURL.searchParams.get("productId");
                readJSONFile(reviewsFile, [], (error, reviews) => {
                    const visible = reviews.filter(review => review.productId === productId && review.status === "Approved");
                    const ratingTotal = visible.reduce((sum, review) => sum + review.rating, 0);
                    sendJSON(res, error ? 500 : 200, { reviews: visible, averageRating: visible.length ? ratingTotal / visible.length : 0, ratingCount: visible.length });
                });
                return;
            }

            if (req.method === "POST" && req.url === "/reviews") {
                readBody(req, (error, data) => {
                    const rating = Number(data?.rating);
                    const productId = String(data?.productId || "");
                    const phone = String(data?.customerPhone || "").trim();
                    if (error || !productId || !/^\d{10}$/.test(phone) || !Number.isInteger(rating) || rating < 1 || rating > 5 || !String(data.review || "").trim()) {
                        sendJSON(res, 400, { success: false, message: "Product, customer phone, 1-5 rating and review are required" });
                        return;
                    }
                    readOrders((ordersError, orders) => {
                        const eligible = orders.some(order => String(order.mobile || order.customer?.phone || "").trim() === phone && order.orderStatus === "Delivered" && (order.products || []).some(item => String(item.productId) === productId));
                        if (ordersError || !eligible) {
                            sendJSON(res, 403, { success: false, message: "Only customers with a delivered order can review this product" });
                            return;
                        }
                        readJSONFile(reviewsFile, [], (readError, reviews) => {
                            if (reviews.some(review => review.productId === productId && review.customerPhone === phone)) {
                                sendJSON(res, 409, { success: false, message: "You have already reviewed this product" });
                                return;
                            }
                            const review = { id: "REV" + Date.now(), productId, customerPhone: phone, customerName: String(data.customerName || "Customer"), rating, review: String(data.review).trim(), status: "Pending", createdAt: new Date().toISOString() };
                            reviews.push(review);
                            saveJSONFile(reviewsFile, reviews, writeError => {
                                if (writeError) {
                                    sendJSON(res, 500, { success: false, message: "Review could not be saved" });
                                    return;
                                }
                                addNotification("admin", `Review pending moderation for product ${productId}`, "review", review.id, () => {});
                                sendJSON(res, 201, { success: true, review });
                            });
                        });
                    });
                });
                return;
            }

            if (req.method === "GET" && req.url === "/admin-reviews") {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                readJSONFile(reviewsFile, [], (error, reviews) => sendJSON(res, error ? 500 : 200, error ? { success: false, reviews: [] } : reviews));
                return;
            }

            if (req.method === "PUT" && req.url.startsWith("/admin-review-status?")) {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                readBody(req, (error, data) => {
                    readJSONFile(reviewsFile, [], (readError, reviews) => {
                        const review = reviews.find(item => item.id === requestURL.searchParams.get("id"));
                        if (error || readError || !review || !["Pending", "Approved", "Rejected"].includes(data?.status)) {
                            sendJSON(res, 400, { success: false, message: "Invalid review update" });
                            return;
                        }
                        review.status = data.status;
                        saveJSONFile(reviewsFile, reviews, writeError => sendJSON(res, writeError ? 500 : 200, writeError ? { success: false, message: "Review could not be updated" } : { success: true, review }));
                    });
                });
                return;
            }

            if (req.method === "DELETE" && req.url.startsWith("/admin-review?")) {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                readJSONFile(reviewsFile, [], (error, reviews) => {
                    const remaining = reviews.filter(review => review.id !== requestURL.searchParams.get("id"));
                    saveJSONFile(reviewsFile, remaining, writeError => sendJSON(res, writeError ? 500 : 200, writeError ? { success: false } : { success: true }));
                });
                return;
            }

            if (req.method === "GET" && req.url === "/categories") {
                readJSONFile(categoriesFile, [], (error, categories) => sendJSON(res, error ? 500 : 200, error ? { success: false, categories: [] } : { success: true, categories: Array.isArray(categories) ? categories : [] }));
                return;
            }

            if (req.method === "POST" && req.url === "/admin-categories") {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                readBody(req, (error, data) => {
                    const name = String(data?.name || "").trim();
                    if (error || !name) {
                        sendJSON(res, 400, { success: false, message: "Category name is required" });
                        return;
                    }
                    readJSONFile(categoriesFile, [], (readError, categories) => {
                        if (readError) {
                            sendJSON(res, 500, { success: false, message: "Category data could not be loaded" });
                            return;
                        }
                        const nextCategory = {
                            id: data?.id || `cat-${Date.now()}`,
                            name,
                            image: data?.image || "product.jpg",
                            active: data?.active !== false,
                            order: Number(data?.order || categories.length + 1)
                        };
                        categories.push(nextCategory);
                        saveJSONFile(categoriesFile, categories, writeError => sendJSON(res, writeError ? 500 : 201, writeError ? { success: false } : { success: true, category: nextCategory }));
                    });
                });
                return;
            }

            if (req.method === "PUT" && req.url.startsWith("/admin-categories?")) {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                readBody(req, (error, data) => readJSONFile(categoriesFile, [], (readError, categories) => {
                    const category = categories.find(item => item.id === requestURL.searchParams.get("id") || item.name === requestURL.searchParams.get("id"));
                    if (error || readError || !category) {
                        sendJSON(res, 404, { success: false, message: "Category not found" });
                        return;
                    }

                    const previousName = category.name;
                    const nextName = data?.name !== undefined ? String(data.name).trim() : category.name;
                    const nextImage = data?.image !== undefined ? String(data.image).trim() || "product.jpg" : category.image;
                    const nextActive = data?.active !== undefined ? Boolean(data.active) : category.active;
                    const nextOrder = data?.order !== undefined ? Number(data.order) : category.order;

                    Object.assign(category, {
                        name: nextName || category.name,
                        image: nextImage || "product.jpg",
                        active: nextActive,
                        order: nextOrder
                    });

                    saveJSONFile(categoriesFile, categories, writeError => {
                        if (writeError) {
                            sendJSON(res, 500, { success: false, message: "Category update failed" });
                            return;
                        }

                        if (!previousName || !nextName || previousName === nextName) {
                            sendJSON(res, 200, { success: true, category });
                            return;
                        }

                        readJSONFile(productsFile, [], (productReadError, products) => {
                            if (!productReadError && Array.isArray(products)) {
                                products.forEach(product => {
                                    const currentCategory = String(product.category || "").trim();
                                    const categorySegments = currentCategory ? currentCategory.split(">").map(part => part.trim()).filter(Boolean) : [];
                                    const matchedIndex = categorySegments.findIndex(segment => segment === previousName);

                                    if (currentCategory === previousName) {
                                        product.category = nextName;
                                        return;
                                    }

                                    if (matchedIndex >= 0) {
                                        categorySegments[matchedIndex] = nextName;
                                        product.category = categorySegments.join(" > ");
                                    }
                                });
                                saveJSONFile(productsFile, products, () => sendJSON(res, 200, { success: true, category }));
                                return;
                            }

                            sendJSON(res, 200, { success: true, category });
                        });
                    });
                }));
                return;
            }

            if (req.method === "DELETE" && req.url.startsWith("/admin-categories?")) {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                readJSONFile(categoriesFile, [], (error, categories) => {
                    const categoryId = requestURL.searchParams.get("id");
                    const category = categories.find(item => item.id === categoryId || item.name === categoryId);
                    const nextCategories = categories.filter(categoryItem => categoryItem.id !== categoryId && categoryItem.name !== categoryId);
                    nextCategories.forEach((categoryItem, index) => { categoryItem.order = index + 1; });
                    saveJSONFile(categoriesFile, nextCategories, writeError => {
                        if (writeError) {
                            sendJSON(res, 500, { success: false, message: "Category could not be deleted" });
                            return;
                        }

                        if (!category || !category.name) {
                            sendJSON(res, 200, { success: true, categories: nextCategories });
                            return;
                        }

                        readJSONFile(productsFile, [], (productReadError, products) => {
                            if (!productReadError && Array.isArray(products)) {
                                products.forEach(product => {
                                    const currentCategory = String(product.category || "").trim();
                                    const categorySegments = currentCategory ? currentCategory.split(">").map(part => part.trim()).filter(Boolean) : [];
                                    const matchedIndex = categorySegments.findIndex(segment => segment === category.name);

                                    if (currentCategory === category.name) {
                                        product.category = "Other";
                                        return;
                                    }

                                    if (matchedIndex >= 0) {
                                        categorySegments.splice(matchedIndex, 1);
                                        product.category = categorySegments.length ? categorySegments.join(" > ") : "Other";
                                    }
                                });
                                saveJSONFile(productsFile, products, () => sendJSON(res, 200, { success: true, categories: nextCategories }));
                                return;
                            }

                            sendJSON(res, 200, { success: true, categories: nextCategories });
                        });
                    });
                });
                return;
            }

            if (req.method === "GET" && req.url === "/promotion") {
                readJSONFile(promotionFile, { id: "promo-default", title: "Get 25% Off", subtitle: "Up To ₹200 Off*", code: "MYMARKETPLACE", discountPercent: 25, maxDiscount: 200, minimumOrder: 0, enabled: true, startDate: "", endDate: "", description: "On your first order | T&C apply", updatedAt: new Date().toISOString() }, (error, promotion) => {
                    if (error) {
                        sendJSON(res, 500, { success: false, promotion: null });
                        return;
                    }
                    sendJSON(res, 200, { success: true, promotion });
                });
                return;
            }

            if (req.method === "POST" && req.url === "/admin-promotion") {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                readBody(req, (error, data) => {
                    if (error) {
                        sendJSON(res, 400, { success: false, message: "Invalid promotion payload" });
                        return;
                    }
                    const nextPromotion = {
                        id: data?.id || "promo-default",
                        title: String(data?.title || "Get 25% Off").trim() || "Get 25% Off",
                        subtitle: String(data?.subtitle || "Up To ₹200 Off*").trim() || "Up To ₹200 Off*",
                        code: String(data?.code || "MYMARKETPLACE").trim().toUpperCase() || "MYMARKETPLACE",
                        discountPercent: Number(data?.discountPercent || 25),
                        maxDiscount: Number(data?.maxDiscount || 200),
                        minimumOrder: Number(data?.minimumOrder || 0),
                        enabled: data?.enabled !== false,
                        startDate: data?.startDate || "",
                        endDate: data?.endDate || "",
                        description: String(data?.description || "On your first order | T&C apply").trim() || "On your first order | T&C apply",
                        updatedAt: new Date().toISOString()
                    };
                    readJSONFile(couponsFile, [], (couponReadError, coupons) => {
                        const existingIndex = coupons.findIndex(item => item.code === nextPromotion.code);
                        const nextCoupon = {
                            id: existingIndex >= 0 ? coupons[existingIndex].id : "CPN" + Date.now(),
                            code: nextPromotion.code,
                            percentage: Number(nextPromotion.discountPercent || 0),
                            flat: Number(nextPromotion.maxDiscount || 0),
                            maxDiscount: Number(nextPromotion.maxDiscount || 0),
                            minimumOrder: Number(nextPromotion.minimumOrder || 0),
                            expiryDate: nextPromotion.endDate || "",
                            startDate: nextPromotion.startDate || "",
                            active: nextPromotion.enabled,
                            usageLimit: Number(data?.usageLimit || 0),
                            usedCount: existingIndex >= 0 ? Number(coupons[existingIndex].usedCount || 0) : 0,
                            createdAt: existingIndex >= 0 ? coupons[existingIndex].createdAt : new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        };
                        if (existingIndex >= 0) {
                            coupons[existingIndex] = nextCoupon;
                        } else {
                            coupons.push(nextCoupon);
                        }
                        saveJSONFile(couponsFile, coupons, (couponWriteError) => {
                            if (couponWriteError) {
                                sendJSON(res, 500, { success: false, message: "Coupon data could not be saved" });
                                return;
                            }
                            saveJSONFile(promotionFile, nextPromotion, (promoWriteError) => sendJSON(res, promoWriteError ? 500 : 200, promoWriteError ? { success: false } : { success: true, promotion: nextPromotion, coupon: nextCoupon }));
                        });
                    });
                });
                return;
            }

            if (req.method === "GET" && req.url === "/admin-coupons") {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                readJSONFile(couponsFile, [], (error, coupons) => sendJSON(res, error ? 500 : 200, error ? { success: false, coupons: [] } : coupons));
                return;
            }

            if (req.method === "POST" && req.url === "/admin-coupons") {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                readBody(req, (error, data) => {
                    const code = String(data?.code || "").trim().toUpperCase();
                    const percentage = Number(data?.percentage || 0);
                    const flat = Number(data?.flat || 0);
                    const maxDiscount = Number(data?.maxDiscount || 0);
                    if (error || !code || (percentage <= 0 && flat <= 0) || percentage > 100 || flat < 0 || percentage < 0 || Number(data.minimumOrder || 0) < 0 || maxDiscount < 0) {
                        sendJSON(res, 400, { success: false, message: "Invalid coupon details" });
                        return;
                    }
                    readJSONFile(couponsFile, [], (readError, coupons) => {
                        if (coupons.some(coupon => coupon.code === code)) {
                            sendJSON(res, 409, { success: false, message: "Coupon code already exists" });
                            return;
                        }
                        const coupon = { id: "CPN" + Date.now(), code, percentage, flat, maxDiscount, minimumOrder: Number(data.minimumOrder || 0), expiryDate: data.expiryDate || "", startDate: data.startDate || "", active: data.active !== false, usageLimit: Number(data.usageLimit || 0), usedCount: 0, createdAt: new Date().toISOString() };
                        coupons.push(coupon);
                        saveJSONFile(couponsFile, coupons, writeError => sendJSON(res, writeError ? 500 : 201, writeError ? { success: false } : { success: true, coupon }));
                    });
                });
                return;
            }

            if (req.method === "POST" && req.url === "/validate-coupon") {
                readBody(req, (error, data) => {
                    const code = String(data?.code || "").trim().toUpperCase();
                    const subtotal = Number(data?.subtotal);
                    readJSONFile(couponsFile, [], (readError, coupons) => {
                        const coupon = coupons.find(item => item.code === code);
                        const started = !coupon?.startDate || new Date(coupon.startDate).getTime() <= Date.now();
                        const expired = coupon?.expiryDate && new Date(coupon.expiryDate).getTime() < Date.now();
                        if (error || readError || !coupon || !coupon.active || !started || expired || !Number.isFinite(subtotal) || subtotal < coupon.minimumOrder || (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit)) {
                            sendJSON(res, 400, { success: false, message: "Coupon is invalid, expired, inactive, or minimum order is not met" });
                            return;
                        }
                        const rawDiscount = coupon.percentage > 0 ? subtotal * coupon.percentage / 100 : coupon.flat;
                        const discountCap = Number(coupon.maxDiscount || 0);
                        const discount = discountCap > 0 ? Math.min(rawDiscount, discountCap) : Math.min(subtotal, rawDiscount);
                        sendJSON(res, 200, { success: true, code: coupon.code, discount, total: Math.max(0, subtotal - discount) });
                    });
                });
                return;
            }

            if (req.method === "PUT" && req.url.startsWith("/admin-coupon?")) {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                readBody(req, (error, data) => readJSONFile(couponsFile, [], (readError, coupons) => {
                    const coupon = coupons.find(item => item.id === requestURL.searchParams.get("id") || item.code === requestURL.searchParams.get("id"));
                    if (error || readError || !coupon) {
                        sendJSON(res, 404, { success: false, message: "Coupon not found" });
                        return;
                    }
                    Object.assign(coupon, { active: data.active !== undefined ? Boolean(data.active) : coupon.active, percentage: data.percentage !== undefined ? Number(data.percentage) : coupon.percentage, flat: data.flat !== undefined ? Number(data.flat) : coupon.flat, maxDiscount: data.maxDiscount !== undefined ? Number(data.maxDiscount) : coupon.maxDiscount, minimumOrder: data.minimumOrder !== undefined ? Number(data.minimumOrder) : coupon.minimumOrder, expiryDate: data.expiryDate !== undefined ? data.expiryDate : coupon.expiryDate, startDate: data.startDate !== undefined ? data.startDate : coupon.startDate, updatedAt: new Date().toISOString() });
                    saveJSONFile(couponsFile, coupons, writeError => sendJSON(res, writeError ? 500 : 200, writeError ? { success: false } : { success: true, coupon }));
                }));
                return;
            }

            if (req.method === "DELETE" && req.url.startsWith("/admin-coupon?")) {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                readJSONFile(couponsFile, [], (error, coupons) => saveJSONFile(couponsFile, coupons.filter(coupon => coupon.id !== requestURL.searchParams.get("id") && coupon.code !== requestURL.searchParams.get("id")), writeError => sendJSON(res, writeError ? 500 : 200, writeError ? { success: false } : { success: true })));
                return;
            }

            if (req.method === "GET" && req.url.startsWith("/notifications?")) {
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                const audience = requestURL.searchParams.get("audience") || "";
                readJSONFile(notificationsFile, [], (error, notifications) => sendJSON(res, error ? 500 : 200, error ? [] : notifications.filter(item => item.audience === audience || item.audience === "all").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))));
                return;
            }

            if (req.method === "PUT" && req.url.startsWith("/notifications-read?")) {
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                readJSONFile(notificationsFile, [], (error, notifications) => {
                    notifications.filter(item => item.audience === requestURL.searchParams.get("audience")).forEach(item => { item.read = true; });
                    saveJSONFile(notificationsFile, notifications, writeError => sendJSON(res, writeError ? 500 : 200, { success: !writeError }));
                });
                return;
            }

            if (
                req.method ===
                    "POST" &&
                req.url ===
                    "/place-order"
            ) {

                readBody(
                    req,
                    (
                        error,
                        order
                    ) => {

                        if (
                            error
                        ) {

                            sendJSON(
                                res,
                                400,
                                {
                                    success:
                                        false,

                                    message:
                                        "Invalid order data"
                                }
                            );

                            return;

                        }


                        readProducts(
                            (
                                productsError,
                                products
                            ) => {

                                if (productsError) {

                                    sendJSON(
                                        res,
                                        500,
                                        {
                                            success: false,
                                            message: "Products could not be read"
                                        }
                                    );

                                    return;

                                }

                                const requestedProducts =
                                    Array.isArray(order.products) && order.products.length
                                        ? order.products
                                        : [order.product || {}];

                                const validatedProducts = [];
                                const stockChanges = [];

                                for (const requested of requestedProducts) {

                                    const product = products.find(item =>
                                        requested.productId &&
                                        String(item.id) === String(requested.productId)
                                    ) || products.find(item =>
                                        requested.name &&
                                        String(item.name) === String(requested.name).split(" — ")[0]
                                    );

                                    const quantity = Number(requested.quantity) || 0;

                                    if (!product || !Number.isInteger(quantity) || quantity < 1) {

                                        sendJSON(
                                            res,
                                            400,
                                            {
                                                success: false,
                                                message: "A valid product and quantity are required"
                                            }
                                        );

                                        return;

                                    }

                                    const variantId = requested.variantId || requested.variant?.id || "";
                                    const variant = Array.isArray(product.variants)
                                        ? product.variants.find(item => String(item.id || item.sku || item.name) === String(variantId))
                                        : null;
                                    const availableStock = variant
                                        ? Number(variant.stock) || 0
                                        : Number(product.stock) || 0;

                                    if (availableStock < quantity) {

                                        sendJSON(
                                            res,
                                            409,
                                            {
                                                success: false,
                                                message: `${product.name} does not have enough stock`
                                            }
                                        );

                                        return;

                                    }

                                    const validatedItem = {
                                        name: requested.name || product.name,
                                        productId: product.id,
                                        price: Number(product.price) || 0,
                                        quantity: quantity,
                                        image: (product.images && product.images[0]) || "product.jpg",
                                        variantId: variant ? (variant.id || variant.sku || variant.name) : "",
                                        variant: variant ? { ...variant } : null,
                                        sellerId: product.sellerId || ""
                                    };

                                    if (variant) {
                                        validatedItem.price = Number(variant.price) || validatedItem.price;
                                        variant.stock = availableStock - quantity;
                                    } else {
                                        product.stock = availableStock - quantity;
                                    }

                                    stockChanges.push({ product, variant, quantity });
                                    validatedProducts.push(validatedItem);

                                }

                                const firstProduct = validatedProducts[0];
                                const validatedTotal = validatedProducts.reduce(
                                    (sum, item) => sum + item.price * item.quantity,
                                    0
                                );

                                const paymentMethod = ["UPI QR Payment", "Online Payment"].includes(order.paymentMethod)
                                    ? "UPI QR Payment"
                                    : "Cash on Delivery";

                                        if (paymentMethod === "UPI QR Payment" && !String(order.paymentReference || "").trim()) {
                                            sendJSON(res, 400, {
                                                success: false,
                                                message: "UTR / transaction reference is required for UPI QR orders"
                                            });
                                            return;
                                        }

                                readJSONFile(couponsFile, [], (couponReadError, coupons) => {
                                const couponCode = String(order.couponCode || "").trim().toUpperCase();
                                const coupon = couponCode ? coupons.find(item => item.code === couponCode) : null;
                                const started = !coupon?.startDate || new Date(coupon.startDate).getTime() <= Date.now();
                                const couponExpired = coupon?.expiryDate && new Date(coupon.expiryDate).getTime() < Date.now();
                                if (couponReadError || (couponCode && (!coupon || !coupon.active || !started || couponExpired || validatedTotal < coupon.minimumOrder || (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit)))) {
                                    sendJSON(res, 400, { success: false, message: "Coupon is invalid, expired, inactive, or minimum order is not met" });
                                    return;
                                }
                                const rawDiscount = coupon ? (coupon.percentage > 0 ? validatedTotal * coupon.percentage / 100 : coupon.flat) : 0;
                                const maxDiscount = Number(coupon?.maxDiscount || 0);
                                const discount = coupon ? (maxDiscount > 0 ? Math.min(rawDiscount, maxDiscount) : Math.min(validatedTotal, rawDiscount)) : 0;

                                order = {
                                    ...order,
                                    product: {
                                        name: firstProduct.name,
                                        price: firstProduct.price,
                                        quantity: firstProduct.quantity,
                                        image: firstProduct.image,
                                        productId: firstProduct.productId,
                                        variantId: firstProduct.variantId || ""
                                    },
                                    products: validatedProducts,
                                    subtotal: validatedTotal,
                                    discount,
                                    couponCode: coupon ? coupon.code : "",
                                    total: Math.max(0, validatedTotal - discount),
                                    paymentMethod,
                                    paymentStatus: paymentMethod === "UPI QR Payment"
                                        ? "Pending Verification"
                                        : "Pending",
                                    orderStatus: "Order Placed"
                                };

                                readOrders(
                            (
                                readError,
                                orders
                            ) => {

                                if (
                                    readError
                                ) {

                                    sendJSON(
                                        res,
                                        500,
                                        {
                                            success:
                                                false,

                                            message:
                                                "Orders could not be read"
                                        }
                                    );

                                    return;

                                }


                                if (order.orderId && orders.some(item => item.orderId === order.orderId)) {
                                    sendJSON(res, 409, {
                                        success: false,
                                        message: "This order has already been processed"
                                    });
                                    return;
                                }

                                const newOrder =
                                    {

                                        id:
                                            Date.now(),

                                        ...order,

                                        createdAt:
                                            new Date()
                                                .toISOString(),

                                        statusHistory: [
                                            {
                                                status: "Order Placed",
                                                date: new Date().toISOString()
                                            }
                                        ]

                                    };


                                orders.push(
                                    newOrder
                                );


                                saveOrders(
                                    orders,
                                    writeError => {

                                        if (
                                            writeError
                                        ) {

                                            stockChanges.forEach(change => {
                                                if (change.variant) {
                                                    change.variant.stock += change.quantity;
                                                } else {
                                                    change.product.stock += change.quantity;
                                                }
                                            });

                                            sendJSON(
                                                res,
                                                500,
                                                {
                                                    success:
                                                        false,

                                                    message:
                                                        "Order could not be saved"
                                                }
                                            );

                                            return;

                                        }


                                        saveProducts(products, productWriteError => {
                                            if (productWriteError) {
                                                sendJSON(res, 500, {
                                                    success: false,
                                                    message: "Stock could not be updated"
                                                });
                                                return;
                                            }

                                            const finishOrder = () => {
                                            addNotification(`customer:${order.customer?.phone || order.mobile || ""}`, `Order ${newOrder.orderId || newOrder.id} confirmed`, "order", newOrder.id, () => {});
                                            addNotification("admin", `New order ${newOrder.orderId || newOrder.id} requires processing`, "order", newOrder.id, () => {});
                                            [...new Set(validatedProducts.map(item => item.sellerId).filter(Boolean))].forEach(sellerId => addNotification(`seller:${sellerId}`, `New order ${newOrder.orderId || newOrder.id} includes your product`, "order", newOrder.id, () => {}));
                                            sendJSON(
                                            res,
                                            200,
                                            {
                                                success:
                                                    true,

                                                message:
                                                    "Order placed successfully",

                                                order:
                                                    newOrder
                                            }
                                        );
                                        };
                                        if (coupon) {
                                            coupon.usedCount = Number(coupon.usedCount || 0) + 1;
                                            saveJSONFile(couponsFile, coupons, couponWriteError => {
                                                if (couponWriteError) {
                                                    sendJSON(res, 500, { success: false, message: "Coupon usage could not be saved" });
                                                    return;
                                                }
                                                finishOrder();
                                            });
                                        } else {
                                            finishOrder();
                                        }
                                        });

                                    }
                                );

                                        });

                                    }
                                );

                            }
                        );

                    }
                );

                return;

            }


            // =================================================
            // GET ORDERS
            // GET /orders
            // =================================================

            if (
                req.method === "PUT" &&
                req.url.startsWith("/update-order-status?")
            ) {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }

                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                const orderId = requestURL.searchParams.get("id");
                readBody(req, (error, data) => {
                    if (error || !data || !data.status) {
                        sendJSON(res, 400, { success: false, message: "A valid status is required" });
                        return;
                    }

                    const allowedStatuses = [
                        "Order Placed", "Confirmed", "Packed", "Shipped",
                        "Out for Delivery", "Delivered", "Cancelled", "Returned / Refunded"
                    ];

                    if (!allowedStatuses.includes(data.status)) {
                        sendJSON(res, 400, { success: false, message: "Invalid order status" });
                        return;
                    }

                    readOrders((readError, orders) => {
                        if (readError) {
                            sendJSON(res, 500, { success: false, message: "Orders could not be read" });
                            return;
                        }

                        const order = orders.find(item => String(item.id) === String(orderId) || item.orderId === orderId);
                        if (!order) {
                            sendJSON(res, 404, { success: false, message: "Order not found" });
                            return;
                        }

                        const currentStatus = order.orderStatus || "Order Placed";
                        const terminal = ["Delivered", "Cancelled", "Returned / Refunded"];
                        if (terminal.includes(currentStatus) && currentStatus !== data.status) {
                            sendJSON(res, 409, { success: false, message: "This order is already in a terminal state" });
                            return;
                        }

                        const statusFlow = ["Order Placed", "Confirmed", "Packed", "Shipped", "Out for Delivery", "Delivered"];
                        const currentIndex = statusFlow.indexOf(currentStatus);
                        const nextIndex = statusFlow.indexOf(data.status);
                        const isValidProgression = nextIndex === currentIndex + 1;
                        const isValidTerminalChange = ["Cancelled", "Returned / Refunded"].includes(data.status);
                        if (currentIndex >= 0 && !isValidProgression && !isValidTerminalChange && currentStatus !== data.status) {
                            sendJSON(res, 409, { success: false, message: "Invalid order status transition" });
                            return;
                        }

                        order.orderStatus = data.status;
                        order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
                        order.statusHistory.push({ status: data.status, date: new Date().toISOString() });
                        addNotification(`customer:${order.customer?.phone || order.mobile || ""}`, `Order ${order.orderId || order.id}: ${data.status}`, "order-status", order.id, () => {});
                        (order.products || []).map(item => item.sellerId).filter(Boolean).forEach(sellerId => addNotification(`seller:${sellerId}`, `Order ${order.orderId || order.id}: ${data.status}`, "order-status", order.id, () => {}));

                        const persistOrder = () => saveOrders(orders, writeError => {
                            if (writeError) {
                                sendJSON(res, 500, { success: false, message: "Order could not be updated" });
                                return;
                            }
                            sendJSON(res, 200, { success: true, order });
                        });

                        if (isValidTerminalChange && !order.stockRestored) {
                            readProducts((productsError, products) => {
                                if (productsError) {
                                    sendJSON(res, 500, { success: false, message: "Products could not be read" });
                                    return;
                                }
                                (order.products || []).forEach(item => {
                                    const product = products.find(productItem => String(productItem.id) === String(item.productId));
                                    if (!product) return;
                                    const variant = Array.isArray(product.variants)
                                        ? product.variants.find(variantItem => String(variantItem.id || variantItem.sku || variantItem.name) === String(item.variantId || ""))
                                        : null;
                                    if (variant) {
                                        variant.stock = Math.max(0, Number(variant.stock) || 0) + Number(item.quantity || 0);
                                    } else {
                                        product.stock = Math.max(0, Number(product.stock) || 0) + Number(item.quantity || 0);
                                    }
                                });
                                order.stockRestored = true;
                                saveProducts(products, productsWriteError => {
                                    if (productsWriteError) {
                                        sendJSON(res, 500, { success: false, message: "Stock could not be restored" });
                                        return;
                                    }
                                    persistOrder();
                                });
                            });
                            return;
                        }

                        persistOrder();
                    });
                });
                return;
            }

            if (
                req.method === "PUT" &&
                req.url.startsWith("/update-payment-status?")
            ) {
                if (!isAdminAuthenticated(req)) {
                    sendJSON(res, 401, { success: false, message: "Unauthorized" });
                    return;
                }

                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                const orderId = requestURL.searchParams.get("id");
                readBody(req, (error, data) => {
                    const allowedStatuses = ["Pending", "Pending Verification", "Paid", "Failed", "Refunded"];
                    if (error || !data || !allowedStatuses.includes(data.status)) {
                        sendJSON(res, 400, { success: false, message: "Invalid payment status" });
                        return;
                    }
                    readOrders((readError, orders) => {
                        if (readError) {
                            sendJSON(res, 500, { success: false, message: "Orders could not be read" });
                            return;
                        }
                        const order = orders.find(item => String(item.id) === String(orderId) || item.orderId === orderId);
                        if (!order) {
                            sendJSON(res, 404, { success: false, message: "Order not found" });
                            return;
                        }
                        order.paymentStatus = data.status;
                        addNotification(`customer:${order.customer?.phone || order.mobile || ""}`, `Payment status for ${order.orderId || order.id}: ${data.status}`, "payment", order.id, () => {});
                        saveOrders(orders, writeError => {
                            if (writeError) {
                                sendJSON(res, 500, { success: false, message: "Payment status could not be updated" });
                                return;
                            }
                            sendJSON(res, 200, { success: true, order });
                        });
                    });
                });
                return;
            }

            if (
                req.method === "GET" &&
                req.url.startsWith("/customer-orders?")
            ) {
                const requestURL = new URL(req.url, `http://${req.headers.host || "localhost"}`);
                const phone = String(requestURL.searchParams.get("phone") || "").trim();
                if (!/^\d{10}$/.test(phone)) {
                    sendJSON(res, 400, { success: false, message: "A valid customer phone is required" });
                    return;
                }
                readOrders((error, orders) => {
                    if (error) {
                        sendJSON(res, 500, { success: false, orders: [] });
                        return;
                    }
                    const customerOrders = orders.filter(item => String(item.mobile || item.customer?.phone || "").trim() === phone);
                    sendJSON(res, 200, customerOrders);
                });
                return;
            }

            if (
                req.method ===
                    "GET" &&
                req.url ===
                    "/orders"
            ) {

                if (!isAdminAuthenticated(req)) {

                    sendJSON(
                        res,
                        401,
                        {
                            success: false,
                            message: "Unauthorized"
                        }
                    );

                    return;

                }

                readOrders(
                    (
                        error,
                        orders
                    ) => {

                        if (
                            error
                        ) {

                            sendJSON(
                                res,
                                500,
                                {
                                    success:
                                        false,

                                    orders:
                                        []
                                }
                            );

                            return;

                        }


                        sendJSON(
                            res,
                            200,
                            orders
                        );

                    }
                );

                return;

            }


            // =================================================
            // GET TRENDING SHORTS
            // GET /shorts
            // =================================================

            if (
                req.method ===
                    "GET" &&
                req.url ===
                    "/shorts"
            ) {

                readShorts(
                    (
                        error,
                        shorts
                    ) => {

                        if (
                            error
                        ) {

                            sendJSON(
                                res,
                                500,
                                {
                                    success:
                                        false,

                                    shorts:
                                        [],

                                    message:
                                        "Trending shorts could not be read"
                                }
                            );

                            return;

                        }


                        /*
                         * Newest published shorts
                         * remain at the top.
                         */

                        const sortedShorts =
                            [...shorts]
                                .sort(
                                    (
                                        a,
                                        b
                                    ) => {

                                        const timeA =
                                            Date.parse(
                                                a?.createdAt ||
                                                ""
                                            ) || 0;

                                        const timeB =
                                            Date.parse(
                                                b?.createdAt ||
                                                ""
                                            ) || 0;

                                        return (
                                            timeB -
                                            timeA
                                        );

                                    }
                                );


                        sendJSON(
                            res,
                            200,
                            sortedShorts
                        );

                    }
                );

                return;

            }


            // =================================================
            // VIDEO STATUS
            //
            // GET /short-video-status?video=short1.mp4
            //
            // Tells Home Page whether the video exists.
            // =================================================

            if (
                req.method ===
                    "GET" &&
                req.url.startsWith(
                    "/short-video-status?"
                )
            ) {

                const requestURL =
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    );


                const video =
                    requestURL
                        .searchParams
                        .get("video") ||
                    "";


                const exists =
                    checkVideoExists(
                        video
                    );


                sendJSON(
                    res,
                    200,
                    {
                        success:
                            true,

                        video:
                            video,

                        exists:
                            exists
                    }
                );

                return;

            }


            // =================================================
            // ADD TRENDING SHORT
            // POST /add-short
            // =================================================

            if (
                req.method ===
                    "POST" &&
                req.url ===
                    "/add-short"
            ) {

                if (!isAdminAuthenticated(req)) {

                    sendJSON(
                        res,
                        401,
                        {
                            success: false,
                            message: "Unauthorized"
                        }
                    );

                    return;
                }

                readBody(
                    req,
                    (
                        error,
                        shortData
                    ) => {

                        if (error) {

                            sendJSON(
                                res,
                                error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400,
                                {
                                    success: false,
                                    message: error.code === "PAYLOAD_TOO_LARGE"
                                        ? "Request body is too large"
                                        : "Invalid short data"
                                }
                            );

                            return;

                        }

                        if (
                            !shortData ||
                            typeof shortData !==
                                "object"
                        ) {

                            sendJSON(
                                res,
                                400,
                                {
                                    success:
                                        false,

                                    message:
                                        "Invalid short data"
                                }
                            );

                            return;

                        }


                        if (
                            !shortData.video
                        ) {

                            sendJSON(
                                res,
                                400,
                                {
                                    success:
                                        false,

                                    message:
                                        "Video is required"
                                }
                            );

                            return;

                        }


                        readShorts(
                            (
                                readError,
                                shorts
                            ) => {

                                if (
                                    readError
                                ) {

                                    sendJSON(
                                        res,
                                        500,
                                        {
                                            success:
                                                false,

                                            message:
                                                "Trending shorts could not be read"
                                        }
                                    );

                                    return;

                                }


                                const newShort =
                                    {

                                        id:
                                            Date.now(),

                                        title:
                                            shortData.title ||
                                            "Trending Short",

                                        label:
                                            shortData.label ||
                                            "TRENDING",

                                        productId:
                                            shortData.productId ||
                                            "",

                                        product:
                                            shortData.product ||
                                            "",

                                        video:
                                            shortData.video,

                                        createdAt:
                                            new Date()
                                                .toISOString()

                                    };


                                shorts.push(
                                    newShort
                                );


                                saveShorts(
                                    shorts,
                                    writeError => {

                                        if (
                                            writeError
                                        ) {

                                            sendJSON(
                                                res,
                                                500,
                                                {
                                                    success:
                                                        false,

                                                    message:
                                                        "Trending short could not be saved"
                                                }
                                            );

                                            return;

                                        }


                                        sendJSON(
                                            res,
                                            200,
                                            {
                                                success:
                                                    true,

                                                message:
                                                    "Trending short published successfully",

                                                short:
                                                    newShort
                                            }
                                        );

                                    }
                                );

                            }
                        );

                    }
                );

                return;

            }


            // =================================================
            // UPDATE TRENDING SHORT
            // PUT /update-short?id=123
            // =================================================

            if (
                req.method ===
                    "PUT" &&
                req.url.startsWith(
                    "/update-short?"
                )
            ) {

                if (!isAdminAuthenticated(req)) {

                    sendJSON(
                        res,
                        401,
                        {
                            success: false,
                            message: "Unauthorized"
                        }
                    );

                    return;

                }

                const requestURL =
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    );

                const shortId = String(
                    requestURL.searchParams.get("id") || ""
                );

                if (!shortId) {

                    sendJSON(
                        res,
                        400,
                        {
                            success: false,
                            message: "Short ID is required"
                        }
                    );

                    return;

                }

                readBody(
                    req,
                    (
                        error,
                        shortData
                    ) => {

                        if (error) {

                            sendJSON(
                                res,
                                error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400,
                                {
                                    success: false,
                                    message: error.code === "PAYLOAD_TOO_LARGE"
                                        ? "Request body is too large"
                                        : "Invalid short data"
                                }
                            );

                            return;

                        }

                        if (
                            !shortData ||
                            typeof shortData !== "object"
                        ) {

                            sendJSON(
                                res,
                                400,
                                {
                                    success: false,
                                    message: "Invalid short data"
                                }
                            );

                            return;

                        }

                        readShorts(
                            (
                                readError,
                                shorts
                            ) => {

                                if (readError) {

                                    sendJSON(
                                        res,
                                        500,
                                        {
                                            success: false,
                                            message: "Trending shorts could not be read"
                                        }
                                    );

                                    return;

                                }

                                const index = shorts.findIndex(
                                    item => String(item.id) === shortId
                                );

                                if (index === -1) {

                                    sendJSON(
                                        res,
                                        404,
                                        {
                                            success: false,
                                            message: "Trending short not found"
                                        }
                                    );

                                    return;

                                }

                                const currentShort = shorts[index];
                                const updatedShort = {
                                    ...currentShort,
                                    title: String(shortData.title ?? currentShort.title ?? "Trending Short").trim() || "Trending Short",
                                    label: String(shortData.label ?? currentShort.label ?? "TRENDING").trim() || "TRENDING",
                                    productId: String(shortData.productId ?? currentShort.productId ?? ""),
                                    product: String(shortData.product ?? currentShort.product ?? "")
                                };

                                if (shortData.video) {
                                    updatedShort.video = shortData.video;
                                }

                                shorts[index] = updatedShort;

                                saveShorts(
                                    shorts,
                                    writeError => {

                                        if (writeError) {

                                            sendJSON(
                                                res,
                                                500,
                                                {
                                                    success: false,
                                                    message: "Trending short could not be updated"
                                                }
                                            );

                                            return;

                                        }

                                        sendJSON(
                                            res,
                                            200,
                                            {
                                                success: true,
                                                message: "Trending short updated successfully",
                                                short: updatedShort
                                            }
                                        );

                                    }
                                );

                            }
                        );

                    }
                );

                return;

            }


            // =================================================
            // DELETE TRENDING SHORT
            // DELETE /delete-short?id=123
            // =================================================

            if (
                req.method ===
                    "DELETE" &&
                req.url.startsWith(
                    "/delete-short?"
                )
            ) {

                if (!isAdminAuthenticated(req)) {

                    sendJSON(
                        res,
                        401,
                        {
                            success: false,
                            message: "Unauthorized"
                        }
                    );

                    return;
                }

                const requestURL =
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    );


                const shortId =
                    String(
                        requestURL
                            .searchParams
                            .get("id") ||
                        ""
                    );


                if (
                    !shortId
                ) {

                    sendJSON(
                        res,
                        400,
                        {
                            success:
                                false,

                            message:
                                "Short ID is required"
                        }
                    );

                    return;

                }


                readShorts(
                    (
                        readError,
                        shorts
                    ) => {

                        if (
                            readError
                        ) {

                            sendJSON(
                                res,
                                500,
                                {
                                    success:
                                        false,

                                    message:
                                        "Trending shorts could not be read"
                                }
                            );

                            return;

                        }


                        const index =
                            shorts.findIndex(
                                item =>
                                    String(
                                        item.id
                                    ) ===
                                    shortId
                            );


                        if (
                            index ===
                            -1
                        ) {

                            sendJSON(
                                res,
                                404,
                                {
                                    success:
                                        false,

                                    message:
                                        "Trending short not found"
                                }
                            );

                            return;

                        }


                        const deletedShort =
                            shorts[index];


                        shorts.splice(
                            index,
                            1
                        );


                        saveShorts(
                            shorts,
                            writeError => {

                                if (
                                    writeError
                                ) {

                                    sendJSON(
                                        res,
                                        500,
                                        {
                                            success:
                                                false,

                                            message:
                                                "Trending short could not be deleted"
                                        }
                                    );

                                    return;

                                }


                                sendJSON(
                                    res,
                                    200,
                                    {
                                        success:
                                            true,

                                        message:
                                            "Trending short deleted successfully",

                                        short:
                                            deletedShort
                                    }
                                );

                            }
                        );

                    }
                );

                return;

            }


            // =================================================
            // STATIC FILE SERVER
            // =================================================

            let requestedFile;


            try {

                requestedFile =
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    ).pathname;

            }
            catch (error) {

                sendText(
                    res,
                    400,
                    "Invalid URL"
                );

                return;

            }


            requestedFile =
                decodeURIComponent(
                    requestedFile
                );


            if (
                requestedFile ===
                "/"
            ) {

                requestedFile =
                    "/index.html";

            }


            const filePath =
                path.join(
                    projectFolder,
                    requestedFile
                );


            // =================================================
            // SECURITY
            // =================================================

            const normalizedProjectFolder =
                path.resolve(
                    projectFolder
                );


            const normalizedFilePath =
                path.resolve(
                    filePath
                );


            if (
                !normalizedFilePath.startsWith(
                    normalizedProjectFolder +
                    path.sep
                ) ||
                requestedFile.startsWith("/server/")
            ) {

                sendText(
                    res,
                    403,
                    "Access denied"
                );

                return;

            }


            // =================================================
            // READ STATIC FILE
            // =================================================

            fs.readFile(
                filePath,
                (error, data) => {

                    if (
                        error
                    ) {

                        if (
                            error.code ===
                            "ENOENT"
                        ) {

                            sendText(
                                res,
                                404,
                                "File not found"
                            );

                        }
                        else {

                            sendText(
                                res,
                                500,
                                "Server error"
                            );

                        }

                        return;

                    }


                    let contentType =
                        "application/octet-stream";


                    if (
                        filePath.endsWith(
                            ".html"
                        )
                    ) {

                        contentType =
                            "text/html; charset=utf-8";

                    }
                    else if (
                        filePath.endsWith(
                            ".css"
                        )
                    ) {

                        contentType =
                            "text/css; charset=utf-8";

                    }
                    else if (
                        filePath.endsWith(
                            ".js"
                        )
                    ) {

                        contentType =
                            "text/javascript; charset=utf-8";

                    }
                    else if (
                        filePath.endsWith(
                            ".json"
                        )
                    ) {

                        contentType =
                            "application/json; charset=utf-8";

                    }
                    else if (
                        filePath.endsWith(
                            ".jpg"
                        ) ||
                        filePath.endsWith(
                            ".jpeg"
                        )
                    ) {

                        contentType =
                            "image/jpeg";

                    }
                    else if (
                        filePath.endsWith(
                            ".png"
                        )
                    ) {

                        contentType =
                            "image/png";

                    }
                    else if (
                        filePath.endsWith(
                            ".webp"
                        )
                    ) {

                        contentType =
                            "image/webp";

                    }
                    else if (
                        filePath.endsWith(
                            ".gif"
                        )
                    ) {

                        contentType =
                            "image/gif";

                    }
                    else if (
                        filePath.endsWith(
                            ".svg"
                        )
                    ) {

                        contentType =
                            "image/svg+xml";

                    }
                    else if (
                        filePath.endsWith(
                            ".ico"
                        )
                    ) {

                        contentType =
                            "image/x-icon";

                    }
                    else if (
                        filePath.endsWith(
                            ".mp4"
                        )
                    ) {

                        contentType =
                            "video/mp4";

                    }
                    else if (
                        filePath.endsWith(
                            ".webm"
                        )
                    ) {

                        contentType =
                            "video/webm";

                    }
                    else if (
                        filePath.endsWith(
                            ".mov"
                        )
                    ) {

                        contentType =
                            "video/quicktime";

                    }


                    res.writeHead(
                        200,
                        {
                            "Content-Type":
                                contentType,

                            "Access-Control-Allow-Origin":
                                "*"
                        }
                    );


                    res.end(
                        data
                    );

                }
            );

        }
    );


// =====================================================
// START SERVER
// =====================================================

const port = Number(process.env.PORT) || 3000;

storage.initialize()
    .then(() => {
        server.listen(
            port,
            "0.0.0.0",
            () => {
                console.log(
                    `Server running on port ${port}`
                );
            }
        );
    })
    .catch((error) => {
        console.error("Failed to initialize storage (code):", error.code || error.name);
        process.exitCode = 1;
    });