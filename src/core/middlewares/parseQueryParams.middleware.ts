import { Request, Response, NextFunction } from "express";
import { TFindInput } from "../../types/types";
import { BadRequestError } from "../errors/AppError";

const parseQueryParams = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      page = "1", 
      limit = "10", 
      search = "", 
      sortBy = "created_at", 
      order = "desc" 
    } = req.query;

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
    } as TFindInput;

    next();
  } catch (error) {
    next(new BadRequestError("Invalid query parameters"));
  }
};

export default parseQueryParams;
