#!/usr/bin/env node
"use strict";

const axios = require("axios");
const readline = require("readline/promises");
const { stdin, stdout } = require("process");

const DEFAULTS = {
  baseUrl: "https://med-adn.com/api/v1",
  email: process.env.ADMIN_CONTENT_EMAIL || "admin@medcin.dz",
  password: process.env.ADMIN_CONTENT_PASSWORD || "ayoubwassim/M8",
  studentEmail: process.env.STUDENT_CONTENT_EMAIL || "mega@gmail.com",
  studentPassword: process.env.STUDENT_CONTENT_PASSWORD || "mega123",
};

const YEAR_LEVELS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN"];
const PACK_TYPES = ["YEAR", "RESIDENCY"];

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unwrapApiBody(body) {
  if (isObject(body) && body.success === false) {
    const message = body.error?.message || body.message || "Request failed";
    throw new Error(message);
  }

  if (isObject(body) && body.success === true && Object.prototype.hasOwnProperty.call(body, "data")) {
    return body.data;
  }

  return body;
}

function extractErrorMessage(status, body) {
  const payload = isObject(body) ? body : {};
  const message =
    payload.error?.message ||
    payload.message ||
    payload.error ||
    `Request failed with HTTP ${status}`;
  return `[${status}] ${message}`;
}

function toInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function flattenModulesFromUnites(unites) {
  if (!Array.isArray(unites)) return [];
  const modules = [];
  for (const unite of unites) {
    const uniteModules = Array.isArray(unite?.modules) ? unite.modules : [];
    for (const module of uniteModules) {
      modules.push(module);
    }
  }
  return modules;
}

function dedupeModules(modules) {
  const seen = new Set();
  const result = [];
  for (const module of modules) {
    const key = module?.id != null ? `id:${module.id}` : JSON.stringify(module);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(module);
  }
  return result;
}

function extractStudyPackModules(payload) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return dedupeModules(payload);
  }

  if (!isObject(payload)) {
    return [];
  }

  const directModules = Array.isArray(payload.modules) ? payload.modules : [];
  const uniteModules = flattenModulesFromUnites(payload.unites);
  const independentModules = Array.isArray(payload.independentModules) ? payload.independentModules : [];

  let nested = [];
  if (payload.studyPack) nested = nested.concat(extractStudyPackModules(payload.studyPack));
  if (payload.data) nested = nested.concat(extractStudyPackModules(payload.data));
  if (payload.item) nested = nested.concat(extractStudyPackModules(payload.item));
  if (Array.isArray(payload.items)) {
    for (const item of payload.items) {
      nested = nested.concat(extractStudyPackModules(item));
    }
  }

  return dedupeModules([...directModules, ...uniteModules, ...independentModules, ...nested]);
}

function extractStudyPackYearLevel(payload) {
  if (!payload || !isObject(payload)) return undefined;
  if (typeof payload.yearNumber === "string" && payload.yearNumber) return payload.yearNumber;
  if (payload.studyPack) {
    const year = extractStudyPackYearLevel(payload.studyPack);
    if (year) return year;
  }
  if (payload.data) {
    const year = extractStudyPackYearLevel(payload.data);
    if (year) return year;
  }
  if (payload.item) {
    const year = extractStudyPackYearLevel(payload.item);
    if (year) return year;
  }
  if (Array.isArray(payload.items)) {
    for (const item of payload.items) {
      const year = extractStudyPackYearLevel(item);
      if (year) return year;
    }
  }
  return undefined;
}

function dedupeModulesWithSource(modules) {
  const seen = new Set();
  const result = [];
  for (const module of modules) {
    const key = module?.id != null ? `id:${module.id}` : JSON.stringify(module);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(module);
  }
  return result;
}

function extractModulesFromContentFilters(payload) {
  const collected = [];

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!isObject(node)) return;

    if (Array.isArray(node.unites)) {
      for (const unite of node.unites) {
        const uniteModules = Array.isArray(unite?.modules) ? unite.modules : [];
        for (const module of uniteModules) {
          collected.push({
            ...module,
            _source: "unite",
          });
        }
      }
    }

    if (Array.isArray(node.independentModules)) {
      for (const module of node.independentModules) {
        collected.push({
          ...module,
          _source: "independent",
        });
      }
    }

    walk(node.data);
    walk(node.item);
    walk(node.items);
    walk(node.result);
  }

  walk(payload);
  return dedupeModulesWithSource(collected);
}

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  async request(method, path, { params, data } = {}) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    let response;
    try {
      response = await axios({
        method,
        url: `${this.baseUrl}${path}`,
        headers,
        params,
        data,
        timeout: 30_000,
        validateStatus: () => true,
      });
    } catch (error) {
      throw new Error(error.message || "Network error");
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(extractErrorMessage(response.status, response.data));
    }

    return unwrapApiBody(response.data);
  }
}

class AdminContentCLI {
  constructor() {
    this.rl = readline.createInterface({
      input: stdin,
      output: stdout,
    });
    this.api = new ApiClient(DEFAULTS.baseUrl);
    this.studentApi = new ApiClient(DEFAULTS.baseUrl);
    this.session = {
      baseUrl: DEFAULTS.baseUrl,
      email: DEFAULTS.email,
    };
  }

  async run() {
    console.log("Admin Content Management CLI");
    console.log("--------------------------------");

    try {
      await this.loginFlow();
      await this.mainMenuLoop();
    } finally {
      this.rl.close();
    }
  }

  async ask(question, { required = false, defaultValue } = {}) {
    while (true) {
      const suffix = defaultValue !== undefined ? ` (${defaultValue})` : "";
      const raw = await this.rl.question(`${question}${suffix}: `);
      const value = raw.trim();

      if (!value && defaultValue !== undefined) {
        return String(defaultValue);
      }

      if (required && !value) {
        console.log("Value is required.");
        continue;
      }

      return value;
    }
  }

  async askNumber(question, { integer = false, required = false, min, defaultValue } = {}) {
    while (true) {
      const raw = await this.ask(question, { required: false, defaultValue });
      if (!raw) {
        if (required) {
          console.log("Value is required.");
          continue;
        }
        return undefined;
      }

      const parsed = integer ? toInt(raw) : toNumber(raw);
      if (parsed === null) {
        console.log(integer ? "Enter a valid integer." : "Enter a valid number.");
        continue;
      }

      if (min !== undefined && parsed < min) {
        console.log(`Value must be >= ${min}.`);
        continue;
      }

      return parsed;
    }
  }

  async askYesNo(question, defaultYes = true) {
    const hint = defaultYes ? "Y/n" : "y/N";
    while (true) {
      const raw = (await this.rl.question(`${question} [${hint}]: `)).trim().toLowerCase();
      if (!raw) return defaultYes;
      if (raw === "y" || raw === "yes") return true;
      if (raw === "n" || raw === "no") return false;
      console.log("Please answer y or n.");
    }
  }

  async askTriState(question) {
    while (true) {
      const raw = (await this.rl.question(`${question} [y/n/skip]: `)).trim().toLowerCase();
      if (!raw || raw === "skip" || raw === "s") return undefined;
      if (raw === "y" || raw === "yes") return true;
      if (raw === "n" || raw === "no") return false;
      console.log("Please answer y, n, or skip.");
    }
  }

  async choose(label, options) {
    console.log(label);
    options.forEach((option, index) => {
      console.log(`${index + 1}. ${option}`);
    });

    while (true) {
      const selected = await this.ask("Select option", { required: true });
      const index = toInt(selected);
      if (index && index >= 1 && index <= options.length) {
        return index;
      }
      console.log("Invalid selection.");
    }
  }

  async loginFlow() {
    const useDefaults = await this.askYesNo(`Use default admin credentials (${DEFAULTS.email})?`, true);
    let email = DEFAULTS.email;
    let password = DEFAULTS.password;

    if (!useDefaults) {
      email = await this.ask("Admin email", { required: true });
      password = await this.ask("Admin password", { required: true });
    }

    const loginData = await this.api.request("post", "/auth/login", {
      data: { email, password },
    });

    const accessToken =
      loginData?.tokens?.accessToken ||
      loginData?.accessToken ||
      loginData?.token;

    if (!accessToken) {
      throw new Error("Could not extract access token from login response.");
    }

    this.api.setToken(accessToken);
    this.session.email = email;

    const profile = await this.api.request("get", "/auth/profile");
    const role = profile?.role || "UNKNOWN";
    if (role !== "ADMIN") {
      throw new Error(`Logged in user is ${role}, ADMIN role is required.`);
    }

    console.log(`Login successful: ${email} (${role})`);
  }

  async ensureStudentSession() {
    if (this.studentApi.token) return;

    const loginData = await this.studentApi.request("post", "/auth/login", {
      data: {
        email: DEFAULTS.studentEmail,
        password: DEFAULTS.studentPassword,
      },
    });

    const accessToken =
      loginData?.tokens?.accessToken ||
      loginData?.accessToken ||
      loginData?.token;

    if (!accessToken) {
      throw new Error("Could not extract access token from student login response.");
    }

    this.studentApi.setToken(accessToken);
  }

  async fetchStudentContentFilters(year) {
    return this.studentApi.request("get", "/students/content/filters", {
      params: { yearLevel: year },
    });
  }

  async resolveStudyPack(studyPackId) {
    const limit = 100;
    let page = 1;

    while (true) {
      const result = await this.api.request("get", "/admin/study-packs", {
        params: { page, limit },
      });
      const items = Array.isArray(result?.items) ? result.items : [];
      const found = items.find((item) => item.id === studyPackId);
      if (found) return found;

      const totalPages = Number(result?.totalPages || 1);
      if (page >= totalPages) break;
      page += 1;
    }

    return undefined;
  }

  async mainMenuLoop() {
    while (true) {
      console.log("\nMain Menu");
      const choice = await this.choose("", [
        "Study Packs",
        "Unites",
        "Modules",
        "Courses",
        "View Content Tree",
        "Re-login",
        "Exit",
      ]);

      try {
        if (choice === 1) await this.studyPackMenu();
        if (choice === 2) await this.uniteMenu();
        if (choice === 3) await this.moduleMenu();
        if (choice === 4) await this.courseMenu();
        if (choice === 5) await this.showContentTree();
        if (choice === 6) await this.loginFlow();
        if (choice === 7) break;
      } catch (error) {
        console.log(`Error: ${error.message}`);
      }
    }
  }

  async previewAndConfirm(payload, actionText) {
    console.log("\nPayload preview:");
    console.log(JSON.stringify(payload, null, 2));
    return this.askYesNo(`${actionText}?`, true);
  }

  async requireDeleteConfirmation(entityName, id) {
    const input = await this.ask(`Type DELETE to confirm ${entityName} #${id} deletion`);
    return input === "DELETE";
  }

  async chooseYearLevel(required = false) {
    const options = [...YEAR_LEVELS, "Skip"];
    const label = required ? "Choose year level" : "Choose year level (or Skip)";
    const selected = await this.choose(label, options);
    if (selected === options.length) return undefined;
    return YEAR_LEVELS[selected - 1];
  }

  async choosePackType(required = true) {
    const options = required ? PACK_TYPES : [...PACK_TYPES, "Skip"];
    const selected = await this.choose("Choose study pack type", options);
    if (!required && selected === options.length) return undefined;
    return options[selected - 1];
  }

  printStudyPacks(items) {
    if (!Array.isArray(items) || items.length === 0) {
      console.log("No study packs found.");
      return;
    }
    console.table(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        yearNumber: item.yearNumber,
        pricePerMonth: item.pricePerMonth,
        pricePerYear: item.pricePerYear,
        isActive: item.isActive,
      }))
    );
  }

  async listStudyPacks() {
    const page = await this.askNumber("Page", { integer: true, min: 1, defaultValue: 1 });
    const limit = await this.askNumber("Limit", { integer: true, min: 1, defaultValue: 10 });
    const result = await this.api.request("get", "/admin/study-packs", {
      params: { page, limit },
    });

    this.printStudyPacks(result?.items || []);
    if (result?.total !== undefined) {
      console.log(
        `Total: ${result.total}, Page: ${result.page}, Limit: ${result.limit}, Total Pages: ${result.totalPages}`
      );
    }
  }

  async createStudyPack() {
    const name = await this.ask("Name", { required: true });
    const description = await this.ask("Description");
    const type = await this.choosePackType(true);
    const yearNumber = type === "YEAR" ? await this.chooseYearLevel(true) : await this.chooseYearLevel(false);
    const pricePerMonth = await this.askNumber("Price per month", { min: 0, required: true });
    const pricePerYear = await this.askNumber("Price per year", { min: 0, required: true });
    const isActive = await this.askYesNo("Is active", true);

    const payload = {
      name,
      type,
      pricePerMonth,
      pricePerYear,
      isActive,
    };
    if (description) payload.description = description;
    if (yearNumber) payload.yearNumber = yearNumber;

    const confirmed = await this.previewAndConfirm(payload, "Create study pack");
    if (!confirmed) return;

    const created = await this.api.request("post", "/admin/study-packs", { data: payload });
    console.log(`Created study pack #${created.id}`);
  }

  async updateStudyPack() {
    const studyPackId = await this.askNumber("Study pack ID", { integer: true, required: true, min: 1 });
    const payload = {};

    const name = await this.ask("Name (leave empty to keep unchanged)");
    if (name) payload.name = name;

    const description = await this.ask("Description (leave empty to keep unchanged)");
    if (description) payload.description = description;

    if (await this.askYesNo("Change type/year?", false)) {
      const type = await this.choosePackType(true);
      payload.type = type;
      const yearNumber = type === "YEAR" ? await this.chooseYearLevel(true) : await this.chooseYearLevel(false);
      if (yearNumber) payload.yearNumber = yearNumber;
    } else {
      const yearNumber = await this.chooseYearLevel(false);
      if (yearNumber) payload.yearNumber = yearNumber;
    }

    const pricePerMonth = await this.askNumber("Price per month (leave empty to keep unchanged)", { min: 0 });
    if (pricePerMonth !== undefined) payload.pricePerMonth = pricePerMonth;

    const pricePerYear = await this.askNumber("Price per year (leave empty to keep unchanged)", { min: 0 });
    if (pricePerYear !== undefined) payload.pricePerYear = pricePerYear;

    const isActive = await this.askTriState("Change active flag");
    if (isActive !== undefined) payload.isActive = isActive;

    if (Object.keys(payload).length === 0) {
      console.log("No fields provided. Update canceled.");
      return;
    }

    const confirmed = await this.previewAndConfirm(payload, `Update study pack #${studyPackId}`);
    if (!confirmed) return;

    const updated = await this.api.request("put", `/admin/study-packs/${studyPackId}`, { data: payload });
    console.log(`Updated study pack #${updated.id}`);
  }

  async deleteStudyPack() {
    const studyPackId = await this.askNumber("Study pack ID", { integer: true, required: true, min: 1 });
    const confirmed = await this.requireDeleteConfirmation("study pack", studyPackId);
    if (!confirmed) {
      console.log("Deletion canceled.");
      return;
    }
    const result = await this.api.request("delete", `/admin/study-packs/${studyPackId}`);
    console.log(result?.message || "Study pack deleted.");
  }

  async studyPackMenu() {
    while (true) {
      console.log("\nStudy Packs");
      const choice = await this.choose("", ["List", "Create", "Update", "Delete", "Back"]);
      if (choice === 1) await this.listStudyPacks();
      if (choice === 2) await this.createStudyPack();
      if (choice === 3) await this.updateStudyPack();
      if (choice === 4) await this.deleteStudyPack();
      if (choice === 5) break;
    }
  }

  async createUnite() {
    const studyPackId = await this.askNumber("Study pack ID", { integer: true, required: true, min: 1 });
    const name = await this.ask("Unite name", { required: true });
    const description = await this.ask("Description");
    const logoUrl = await this.ask("Logo URL");

    const payload = { studyPackId, name };
    if (description) payload.description = description;
    if (logoUrl) payload.logoUrl = logoUrl;

    const confirmed = await this.previewAndConfirm(payload, "Create unite");
    if (!confirmed) return;

    const created = await this.api.request("post", "/admin/content/unites", { data: payload });
    console.log(`Created unite #${created.id}`);
  }

  async updateUnite() {
    const unitId = await this.askNumber("Unite ID", { integer: true, required: true, min: 1 });
    console.log("Note: backend validation currently requires both studyPackId and name for update.");
    const studyPackId = await this.askNumber("Study pack ID", { integer: true, required: true, min: 1 });
    const name = await this.ask("Unite name", { required: true });
    const description = await this.ask("Description");
    const logoUrl = await this.ask("Logo URL");

    const payload = { studyPackId, name };
    if (description) payload.description = description;
    if (logoUrl) payload.logoUrl = logoUrl;

    const confirmed = await this.previewAndConfirm(payload, `Update unite #${unitId}`);
    if (!confirmed) return;

    const updated = await this.api.request("put", `/admin/content/unites/${unitId}`, { data: payload });
    console.log(`Updated unite #${updated.id}`);
  }

  async deleteUnite() {
    const unitId = await this.askNumber("Unite ID", { integer: true, required: true, min: 1 });
    const confirmed = await this.requireDeleteConfirmation("unite", unitId);
    if (!confirmed) {
      console.log("Deletion canceled.");
      return;
    }
    const result = await this.api.request("delete", `/admin/content/unites/${unitId}`);
    console.log(result?.message || "Unite deleted.");
  }

  async uniteMenu() {
    while (true) {
      console.log("\nUnites");
      const choice = await this.choose("", ["Create", "Update", "Delete", "Back"]);
      if (choice === 1) await this.createUnite();
      if (choice === 2) await this.updateUnite();
      if (choice === 3) await this.deleteUnite();
      if (choice === 4) break;
    }
  }

  async createModule() {
    const name = await this.ask("Module name", { required: true });
    const mode = await this.choose("Module creation mode", [
      "Attach to an existing unite",
      "Create independent module",
    ]);

    let uniteId;
    let selectedStudyPack;
    if (mode === 1) {
      uniteId = await this.askNumber("Unite ID", {
        integer: true,
        min: 1,
        required: true,
      });
    } else {
      while (true) {
        const studyPackId = await this.askNumber("Study pack ID (required for independent module)", {
          integer: true,
          min: 1,
          required: true,
        });
        const resolved = await this.resolveStudyPack(studyPackId);
        if (resolved) {
          selectedStudyPack = resolved;
          break;
        }
        console.log(`Study pack #${studyPackId} was not found. Try again.`);
      }
    }

    const description = await this.ask("Description");

    const payload = { name };
    if (uniteId !== undefined) payload.uniteId = uniteId;
    if (description) payload.description = description;

    if (selectedStudyPack) {
      console.log(
        `Selected study pack for independent module: #${selectedStudyPack.id} - ${selectedStudyPack.name}`
      );
    }

    const confirmed = await this.previewAndConfirm(payload, "Create module");
    if (!confirmed) return;

    const created = await this.api.request("post", "/admin/content/modules", { data: payload });
    console.log(`Created module #${created.id}`);
  }

  async updateModule() {
    const moduleId = await this.askNumber("Module ID", { integer: true, required: true, min: 1 });
    console.log("Note: backend validation currently requires name for update.");
    const name = await this.ask("Module name", { required: true });
    const uniteId = await this.askNumber("Unite ID (leave empty to keep/update none)", {
      integer: true,
      min: 1,
    });
    const description = await this.ask("Description");

    const payload = { name };
    if (uniteId !== undefined) payload.uniteId = uniteId;
    if (description) payload.description = description;

    const confirmed = await this.previewAndConfirm(payload, `Update module #${moduleId}`);
    if (!confirmed) return;

    const updated = await this.api.request("put", `/admin/content/modules/${moduleId}`, { data: payload });
    console.log(`Updated module #${updated.id}`);
  }

  async deleteModule() {
    const moduleId = await this.askNumber("Module ID", { integer: true, required: true, min: 1 });
    const confirmed = await this.requireDeleteConfirmation("module", moduleId);
    if (!confirmed) {
      console.log("Deletion canceled.");
      return;
    }
    const result = await this.api.request("delete", `/admin/content/modules/${moduleId}`);
    console.log(result?.message || "Module deleted.");
  }

  async moduleMenu() {
    while (true) {
      console.log("\nModules");
      const choice = await this.choose("", ["Get by Study Pack", "Create", "Update", "Delete", "Back"]);
      if (choice === 1) await this.getModulesByStudyPack();
      if (choice === 2) await this.createModule();
      if (choice === 3) await this.updateModule();
      if (choice === 4) await this.deleteModule();
      if (choice === 5) break;
    }
  }

  async getModulesByStudyPack() {
    const studyPackId = await this.askNumber("Study pack ID", { integer: true, required: true, min: 1 });
    await this.ensureStudentSession();

    const adminStudyPack = await this.resolveStudyPack(studyPackId);
    const yearLevel =
      adminStudyPack?.yearNumber ||
      extractStudyPackYearLevel(adminStudyPack);

    if (!yearLevel) {
      throw new Error(`Could not resolve yearLevel for study pack #${studyPackId}.`);
    }

    const filtersResult = await this.fetchStudentContentFilters(yearLevel);
    const modules = extractModulesFromContentFilters(filtersResult);

    if (modules.length === 0) {
      console.log(`No modules found for study pack #${studyPackId}.`);
      return;
    }

    console.log(
      `Modules for study pack #${studyPackId}${adminStudyPack?.name ? ` (${adminStudyPack.name})` : ""} - year ${yearLevel}`
    );
    console.table(
      modules.map((module) => ({
        id: module.id,
        name: module.name,
        coursesCount: Array.isArray(module.courses) ? module.courses.length : 0,
        source: module._source || "unknown",
      }))
    );

    for (const module of modules) {
      const courses = Array.isArray(module.courses) ? module.courses : [];
      if (courses.length === 0) continue;

      console.log(`\n[M:${module.id}] ${module.name} (${module._source || "unknown"})`);
      for (const course of courses) {
        console.log(`  - [C:${course.id}] ${course.name}`);
      }
    }
  }

  async createCourse() {
    const moduleId = await this.askNumber("Module ID", { integer: true, required: true, min: 1 });
    const name = await this.ask("Course name", { required: true });
    const description = await this.ask("Description");

    const payload = { moduleId, name };
    if (description) payload.description = description;

    const confirmed = await this.previewAndConfirm(payload, "Create course");
    if (!confirmed) return;

    const created = await this.api.request("post", "/admin/content/courses", { data: payload });
    console.log(`Created course #${created.id}`);
  }

  async updateCourse() {
    const courseId = await this.askNumber("Course ID", { integer: true, required: true, min: 1 });
    console.log("Note: backend validation currently requires moduleId + name for update.");
    const moduleId = await this.askNumber("Module ID", { integer: true, required: true, min: 1 });
    const name = await this.ask("Course name", { required: true });
    const description = await this.ask("Description");

    const payload = { moduleId, name };
    if (description) payload.description = description;

    const confirmed = await this.previewAndConfirm(payload, `Update course #${courseId}`);
    if (!confirmed) return;

    const updated = await this.api.request("put", `/admin/content/courses/${courseId}`, { data: payload });
    console.log(`Updated course #${updated.id}`);
  }

  async deleteCourse() {
    const courseId = await this.askNumber("Course ID", { integer: true, required: true, min: 1 });
    const confirmed = await this.requireDeleteConfirmation("course", courseId);
    if (!confirmed) {
      console.log("Deletion canceled.");
      return;
    }
    const result = await this.api.request("delete", `/admin/content/courses/${courseId}`);
    console.log(result?.message || "Course deleted.");
  }

  async courseMenu() {
    while (true) {
      console.log("\nCourses");
      const choice = await this.choose("", ["Create", "Update", "Delete", "Back"]);
      if (choice === 1) await this.createCourse();
      if (choice === 2) await this.updateCourse();
      if (choice === 3) await this.deleteCourse();
      if (choice === 4) break;
    }
  }

  printContentTree(data) {
    const unites = data?.unites || [];
    if (!Array.isArray(unites) || unites.length === 0) {
      console.log("No content found for selected filters.");
      return;
    }

    for (const unite of unites) {
      console.log(`\n[U:${unite.id}] ${unite.name}`);
      const modules = Array.isArray(unite.modules) ? unite.modules : [];
      if (modules.length === 0) {
        console.log("  (no modules)");
        continue;
      }

      for (const module of modules) {
        console.log(`  [M:${module.id}] ${module.name}`);
        const courses = Array.isArray(module.courses) ? module.courses : [];
        if (courses.length === 0) {
          console.log("    (no courses)");
          continue;
        }
        for (const course of courses) {
          console.log(`    [C:${course.id}] ${course.name}`);
        }
      }
    }
  }

  async showContentTree() {
    const isResidency = await this.askTriState("Filter by residency");
    const yearLevel = await this.chooseYearLevel(false);
    const params = {};
    if (isResidency !== undefined) params.isResidency = isResidency;
    if (yearLevel) params.yearLevel = yearLevel;

    const data = await this.api.request("get", "/admin/content/filters", { params });
    this.printContentTree(data);
  }
}

async function main() {
  const cli = new AdminContentCLI();

  try {
    await cli.run();
    console.log("Exited.");
    process.exit(0);
  } catch (error) {
    console.error(`Fatal: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
