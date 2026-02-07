"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AppError_1 = require("../errors/AppError");
const parseQueryParams = (req, res, next) => {
    try {
        const { page = "1", limit = "10", search = "", sortBy = "created_at", order = "desc" } = req.query;
        // Convert and sanitize query params
        const pageNum = Number(page) || 1;
        const limitNum = Number(limit) || 10;
        const skip = (pageNum - 1) * limitNum;
        const orderValue = (order === "asc" || order === "desc") ? order : "desc";
        req.queryParams = {
            page: pageNum,
            limit: limitNum,
            skip,
            search: search ? String(search) : "",
            sortBy: sortBy ? String(sortBy) : "created_at",
            order: orderValue,
        };
        next();
    }
    catch (error) {
        next(new AppError_1.BadRequestError("Invalid query parameters"));
    }
};
exports.default = parseQueryParams;
