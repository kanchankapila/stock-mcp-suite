/**
 * Shared validation utilities for backend
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class ValidationUtils {
  public static validateSymbol(symbol: string): ValidationResult {
    const errors: string[] = [];
    
    if (!symbol || typeof symbol !== 'string') {
      errors.push('Symbol is required');
    } else {
      const trimmed = symbol.trim().toUpperCase();
      if (trimmed.length === 0) {
        errors.push('Symbol cannot be empty');
      } else if (trimmed.length > 10) {
        errors.push('Symbol cannot exceed 10 characters');
      } else if (!/^[A-Z0-9.]+$/.test(trimmed)) {
        errors.push('Symbol can only contain letters, numbers, and dots');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  public static validateDateRange(from: string, to: string): ValidationResult {
    const errors: string[] = [];
    
    if (!from || !to) {
      errors.push('Both from and to dates are required');
      return { isValid: false, errors };
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime())) {
      errors.push('Invalid from date format');
    }

    if (isNaN(toDate.getTime())) {
      errors.push('Invalid to date format');
    }

    if (fromDate > toDate) {
      errors.push('From date cannot be after to date');
    }

    const now = new Date();
    if (fromDate > now) {
      errors.push('From date cannot be in the future');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  public static validatePagination(page?: number, limit?: number): ValidationResult {
    const errors: string[] = [];
    
    if (page !== undefined) {
      if (!Number.isInteger(page) || page < 1) {
        errors.push('Page must be a positive integer');
      }
    }

    if (limit !== undefined) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
        errors.push('Limit must be between 1 and 1000');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  public static validateRequired(value: any, fieldName: string): ValidationResult {
    const errors: string[] = [];
    
    if (value === undefined || value === null || value === '') {
      errors.push(`${fieldName} is required`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  public static validateEmail(email: string): ValidationResult {
    const errors: string[] = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email || typeof email !== 'string') {
      errors.push('Email is required');
    } else if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  public static validateNumeric(value: any, fieldName: string, min?: number, max?: number): ValidationResult {
    const errors: string[] = [];
    
    if (value === undefined || value === null || value === '') {
      errors.push(`${fieldName} is required`);
      return { isValid: false, errors };
    }

    const num = Number(value);
    if (isNaN(num)) {
      errors.push(`${fieldName} must be a valid number`);
      return { isValid: false, errors };
    }

    if (min !== undefined && num < min) {
      errors.push(`${fieldName} must be at least ${min}`);
    }

    if (max !== undefined && num > max) {
      errors.push(`${fieldName} must be at most ${max}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  public static validateString(value: any, fieldName: string, minLength?: number, maxLength?: number): ValidationResult {
    const errors: string[] = [];
    
    if (value === undefined || value === null) {
      errors.push(`${fieldName} is required`);
      return { isValid: false, errors };
    }

    const str = String(value).trim();
    if (str.length === 0) {
      errors.push(`${fieldName} cannot be empty`);
      return { isValid: false, errors };
    }

    if (minLength !== undefined && str.length < minLength) {
      errors.push(`${fieldName} must be at least ${minLength} characters long`);
    }

    if (maxLength !== undefined && str.length > maxLength) {
      errors.push(`${fieldName} must be at most ${maxLength} characters long`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  public static combineResults(...results: ValidationResult[]): ValidationResult {
    const allErrors = results.flatMap(r => r.errors);
    return {
      isValid: allErrors.length === 0,
      errors: allErrors
    };
  }
}
