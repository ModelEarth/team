// src/import.rs
use calamine::{Reader, Xlsx, open_workbook, Data};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use std::collections::HashMap;
use actix_web::{web, HttpResponse, Result};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportRequest {
    pub file_path: String,
    pub sheet_name: Option<String>,
    pub table_name: String,
    pub column_mappings: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
pub struct ImportResponse {
    pub success: bool,
    pub message: String,
    pub records_processed: Option<usize>,
    pub records_inserted: Option<usize>,
    pub records_skipped: Option<usize>,
    pub duplicate_check_columns: Option<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectRecord {
    pub fiscal_year: Option<String>,
    pub project_number: Option<String>,
    pub project_type: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    pub department: Option<String>,
    pub framework: Option<String>,
    pub project_name: Option<String>,
    pub committed: Option<f64>,
    pub naics_sector: Option<String>,
    pub project_description: Option<String>,
    pub project_profile_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DataImportRequest {
    pub data: Vec<HashMap<String, serde_json::Value>>,
    pub headers: Vec<String>,
    pub table_name: String,
    pub source: String,
    pub file_source: String,
}

#[derive(Debug, Serialize)]
pub struct DataImportResponse {
    pub success: bool,
    pub message: String,
    pub imported_count: Option<usize>,
    pub skipped_count: Option<usize>,
    pub duplicate_check_columns: Option<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DemocracyLabProject {
    #[serde(rename = "project_name")]
    pub name: String,
    #[serde(rename = "project_description")]
    pub description: Option<String>,
    #[serde(rename = "project_url")]
    pub url: Option<String>,
}

/// Import Excel data into the projects table
pub async fn import_excel_data(
    pool: web::Data<std::sync::Arc<crate::ApiState>>,
    req: web::Json<ImportRequest>,
) -> Result<HttpResponse> {
    let db = match &pool.db {
        Some(db) => db,
        None => {
            return Ok(HttpResponse::ServiceUnavailable().json(ImportResponse {
                success: false,
                message: "Database not available. Server started without database connection.".to_string(),
                records_processed: Some(0),
                records_inserted: Some(0),
                records_skipped: Some(0),
                duplicate_check_columns: None,
                errors: vec!["Database connection not available".to_string()],
            }));
        }
    };
    
    let mut errors = Vec::new();
    
    // Read Excel file
    let records = match read_excel_file(&req.file_path, req.sheet_name.as_deref()) {
        Ok(data) => data,
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(ImportResponse {
                success: false,
                message: format!("Failed to read Excel file at '{}': {}", req.file_path, e),
                records_processed: None,
                records_inserted: None,
                records_skipped: None,
                duplicate_check_columns: None,
                errors: vec![format!("File path: {} - {}", req.file_path, e.to_string())],
            }));
        }
    };

    // Process and insert records
    let mut inserted_count = 0;
    let mut skipped_count = 0;
    let total_records = records.len();

    for (index, record) in records.iter().enumerate() {
        match insert_project_record(db, record).await {
            Ok(InsertResult::Inserted) => inserted_count += 1,
            Ok(InsertResult::Skipped) => skipped_count += 1,
            Err(e) => {
                errors.push(format!("Row {}: {}", index + 1, e));
            }
        }
    }

    let message = if errors.is_empty() {
        if skipped_count > 0 {
            format!("Successfully imported {inserted_count} records, skipped {skipped_count} duplicates")
        } else {
            format!("Successfully imported {inserted_count} records")
        }
    } else {
        format!("Imported {} of {} records with {} errors, skipped {} duplicates", 
                inserted_count, total_records, errors.len(), skipped_count)
    };

    Ok(HttpResponse::Ok().json(ImportResponse {
        success: errors.is_empty() || inserted_count > 0,
        message,
        records_processed: Some(total_records),
        records_inserted: Some(inserted_count),
        records_skipped: Some(skipped_count),
        duplicate_check_columns: Some("Name + Region + Department".to_string()),
        errors,
    }))
}

/// Preview Excel data without importing
pub async fn preview_excel_data(
    req: web::Json<ImportRequest>,
) -> Result<HttpResponse> {
    println!("Preview request - file_path: {}, sheet_name: {:?}", req.file_path, req.sheet_name);
    let records = match read_excel_file(&req.file_path, req.sheet_name.as_deref()) {
        Ok(data) => data,
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(ImportResponse {
                success: false,
                message: format!("Failed to read Excel file at '{}': {}", req.file_path, e),
                records_processed: None,
                records_inserted: None,
                records_skipped: None,
                duplicate_check_columns: None,
                errors: vec![format!("File path: {} - {}", req.file_path, e.to_string())],
            }));
        }
    };

    // Return first 10 records for preview
    let preview_records: Vec<&ProjectRecord> = records.iter().take(10).collect();
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": format!("Preview of {} records (showing first 10)", records.len()),
        "total_records": records.len(),
        "preview": preview_records
    })))
}

/// Get Excel file sheets
pub async fn get_excel_sheets(
    req: web::Json<serde_json::Value>,
) -> Result<HttpResponse> {
    let file_path = match req.get("file_path").and_then(|v| v.as_str()) {
        Some(path) => {
            println!("Sheets request - file_path: {path}");
            path
        },
        None => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "success": false,
                "message": "file_path is required"
            })));
        }
    };

    match get_excel_sheet_names(file_path) {
        Ok(sheets) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "sheets": sheets
        }))),
        Err(e) => Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "success": false,
            "message": format!("Failed to read Excel file at '{}': {}", file_path, e)
        })))
    }
}

fn read_excel_file(file_path: &str, sheet_name: Option<&str>) -> Result<Vec<ProjectRecord>, Box<dyn std::error::Error>> {
    let mut workbook: Xlsx<_> = open_workbook(file_path)
        .map_err(|e| format!("File not found at: {file_path} - {e}"))?;
    
    let sheet_name = match sheet_name {
        Some(name) => name.to_string(),
        None => workbook.sheet_names().first().unwrap_or(&"Sheet1".to_string()).clone(),
    };

    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| format!("Error reading sheet: {e}"))?;

    let mut records = Vec::new();
    let mut headers = HashMap::new();
    
    // Get headers from first row
    if let Some(first_row) = range.rows().next() {
        for (col_idx, cell) in first_row.iter().enumerate() {
            let header = cell.to_string().to_lowercase().trim().to_string();
            headers.insert(col_idx, header);
        }
    }

    // Process data rows (skip header row)
    for row in range.rows().skip(1) {
        let mut record = ProjectRecord {
            fiscal_year: None,
            project_number: None,
            project_type: None,
            region: None,
            country: None,
            department: None,
            framework: None,
            project_name: None,
            committed: None,
            naics_sector: None,
            project_description: None,
            project_profile_url: None,
        };

        for (col_idx, cell) in row.iter().enumerate() {
            if let Some(header) = headers.get(&col_idx) {
                let value = match cell {
                    Data::Empty => None,
                    Data::String(s) => if s.trim().is_empty() { None } else { Some(s.trim().to_string()) },
                    Data::Float(f) => Some(f.to_string()),
                    Data::Int(i) => Some(i.to_string()),
                    Data::Bool(b) => Some(b.to_string()),
                    _ => Some(cell.to_string()),
                };

                match header.as_str() {
                    "fiscal year" => record.fiscal_year = value,
                    "project number" => record.project_number = value,
                    "project type" => record.project_type = value,
                    "region" => record.region = value,
                    "country" => record.country = value,
                    "department" => record.department = value,
                    "framework" => record.framework = value,
                    "project name" => record.project_name = value,
                    "committed" => {
                        record.committed = value.and_then(|v| v.parse::<f64>().ok());
                    }
                    "naics sector" => record.naics_sector = value,
                    "project description" => record.project_description = value,
                    "project profile url" => record.project_profile_url = value,
                    _ => {} // Ignore unknown columns
                }
            }
        }

        // Only include records with at least a project name
        if record.project_name.is_some() {
            records.push(record);
        }
    }

    Ok(records)
}

fn get_excel_sheet_names(file_path: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let workbook: Xlsx<_> = open_workbook(file_path)
        .map_err(|e| format!("File not found at: {file_path} - {e}"))?;
    Ok(workbook.sheet_names().clone())
}

#[derive(Debug)]
enum InsertResult {
    Inserted,
    Skipped,
}

async fn insert_project_record(
    pool: &Pool<Postgres>,
    record: &ProjectRecord,
) -> Result<InsertResult, sqlx::Error> {
    // Check for existing record based on name, region, and department
    let existing_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*) FROM projects 
        WHERE name = $1 
        AND (description LIKE '%Region: ' || $2 || '%' OR $2 IS NULL)
        AND (description LIKE '%Department: ' || $3 || '%' OR $3 IS NULL)
        "#
    )
    .bind(&record.project_name)
    .bind(&record.region)
    .bind(&record.department)
    .fetch_one(pool)
    .await?;

    if existing_count > 0 {
        // Record already exists, skip insertion
        println!("Skipping duplicate project: {} (Region: {:?}, Department: {:?})", 
                 record.project_name.as_deref().unwrap_or("Unknown"),
                 record.region,
                 record.department);
        return Ok(InsertResult::Skipped);
    }

    let id = Uuid::new_v4();
    let now = Utc::now();
    
    // Create a description combining multiple fields
    let mut description_parts = Vec::new();
    
    if let Some(desc) = &record.project_description {
        description_parts.push(desc.clone());
    }
    
    if let Some(dept) = &record.department {
        description_parts.push(format!("Department: {dept}"));
    }
    
    if let Some(region) = &record.region {
        description_parts.push(format!("Region: {region}"));
    }
    
    if let Some(country) = &record.country {
        description_parts.push(format!("Country: {country}"));
    }
    
    if let Some(framework) = &record.framework {
        description_parts.push(format!("Framework: {framework}"));
    }
    
    if let Some(naics) = &record.naics_sector {
        description_parts.push(format!("NAICS Sector: {naics}"));
    }
    
    if let Some(url) = &record.project_profile_url {
        description_parts.push(format!("Profile URL: {url}"));
    }
    
    let description = if description_parts.is_empty() {
        None
    } else {
        Some(description_parts.join("

"))
    };

    // Set priority based on committed amount
    let priority = match record.committed {
        Some(amount) if amount >= 10_000_000.0 => Some("High".to_string()),
        Some(amount) if amount >= 1_000_000.0 => Some("Medium".to_string()),
        Some(_) => Some("Low".to_string()),
        None => None,
    };

    // Set status based on project type
    let status = match &record.project_type {
        Some(pt) if pt.to_lowercase().contains("active") => Some("Active".to_string()),
        Some(pt) if pt.to_lowercase().contains("planned") => Some("Planning".to_string()),
        Some(pt) if pt.to_lowercase().contains("completed") => Some("Completed".to_string()),
        _ => Some("Active".to_string()), // Default status
    };

    sqlx::query(
        r#"
        INSERT INTO projects (
            id, name, description, status, priority,
            date_entered, date_modified, created_by, modified_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#
    )
    .bind(id)
    .bind(&record.project_name)
    .bind(&description)
    .bind(&status)
    .bind(&priority)
    .bind(now)
    .bind(now)
    .bind("excel-import") // Creator identifier
    .bind("excel-import") // Modifier identifier
    .execute(pool)
    .await?;

    Ok(InsertResult::Inserted)
}

/// Import JSON data directly into specified table
pub async fn import_data(
    pool: web::Data<std::sync::Arc<crate::ApiState>>,
    req: web::Json<DataImportRequest>,
) -> Result<HttpResponse> {
    let db = match &pool.db {
        Some(db) => db,
        None => {
            return Ok(HttpResponse::ServiceUnavailable().json(ImportResponse {
                success: false,
                message: "Database not available. Server started without database connection.".to_string(),
                records_processed: Some(0),
                records_inserted: Some(0),
                records_skipped: Some(0),
                duplicate_check_columns: None,
                errors: vec!["Database connection not available".to_string()],
            }));
        }
    };
    
    let mut errors = Vec::new();
    let mut imported_count = 0;
    let mut skipped_count = 0;
    let mut actual_duplicate_check_columns = None;
    
    println!("Data import request - table: {}, source: {}, records: {}", 
        req.table_name, req.source, req.data.len());
    
    match req.table_name.as_str() {
        "accounts" => {
            for (index, record) in req.data.iter().enumerate() {
                match import_account_record(db, record).await {
                    Ok((InsertResult::Inserted, fields_used)) => {
                        imported_count += 1;
                        if actual_duplicate_check_columns.is_none() {
                            actual_duplicate_check_columns = Some(fields_used);
                        }
                    },
                    Ok((InsertResult::Skipped, fields_used)) => {
                        skipped_count += 1;
                        if actual_duplicate_check_columns.is_none() {
                            actual_duplicate_check_columns = Some(fields_used);
                        }
                    },
                    Err(e) => {
                        let error_msg = format!("Row {}: {}", index + 1, e);
                        println!("Import error: {error_msg}");
                        errors.push(error_msg);
                    }
                }
            }
        }
        "projects" => {
            for (index, record) in req.data.iter().enumerate() {
                match import_project_record_from_json(db, record).await {
                    Ok((InsertResult::Inserted, fields_used)) => {
                        imported_count += 1;
                        if actual_duplicate_check_columns.is_none() {
                            actual_duplicate_check_columns = Some(fields_used);
                        }
                    },
                    Ok((InsertResult::Skipped, fields_used)) => {
                        skipped_count += 1;
                        if actual_duplicate_check_columns.is_none() {
                            actual_duplicate_check_columns = Some(fields_used);
                        }
                    },
                    Err(e) => {
                        let error_msg = format!("Row {}: {}", index + 1, e);
                        println!("Import error: {error_msg}");
                        errors.push(error_msg);
                    }
                }
            }
        }
        _ => {
            errors.push(format!("Unsupported table: {}", req.table_name));
        }
    }
    
    let success = errors.is_empty() || (imported_count > 0 && errors.len() < req.data.len());
    let message = if success {
        if errors.is_empty() {
            if skipped_count > 0 {
                format!("Successfully imported {} records into {}, skipped {} duplicates", 
                        imported_count, req.table_name, skipped_count)
            } else {
                format!("Successfully imported {} records into {}", imported_count, req.table_name)
            }
        } else {
            format!("Imported {} of {} records into {} with {} errors, skipped {} duplicates", 
                imported_count, req.data.len(), req.table_name, errors.len(), skipped_count)
        }
    } else {
        format!("Failed to import data into {}", req.table_name)
    };
    
    let duplicate_check_columns = actual_duplicate_check_columns.or_else(|| {
        match req.table_name.as_str() {
            "accounts" => Some("Name + Industry".to_string()),
            "projects" => Some("Name + Region + Department".to_string()),
            _ => None,
        }
    });
    
    Ok(HttpResponse::Ok().json(DataImportResponse {
        success,
        message,
        imported_count: Some(imported_count),
        skipped_count: Some(skipped_count),
        duplicate_check_columns,
        errors,
    }))
}

/// Helper function to import a single account record
/// Returns (InsertResult, fields_used_for_duplicate_check)
async fn import_account_record(
    pool: &Pool<Postgres>,
    record: &HashMap<String, serde_json::Value>,
) -> Result<(InsertResult, String), Box<dyn std::error::Error>> {
    // Extract fields from the record
    let name = record.get("Name")
        .or_else(|| record.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown");
    
    let email = record.get("Email")
        .or_else(|| record.get("email"))
        .and_then(|v| v.as_str());
    
    let phone = record.get("Phone")
        .or_else(|| record.get("phone"))
        .and_then(|v| v.as_str());
    
    let website = record.get("Website")
        .or_else(|| record.get("website"))
        .and_then(|v| v.as_str());
    
    let industry = record.get("Industry")
        .or_else(|| record.get("industry"))
        .or_else(|| record.get("Sector"))
        .or_else(|| record.get("sector"))
        .and_then(|v| v.as_str());
    
    // Check for existing record based on available fields
    let existing_count = if industry.is_some() {
        // Use name + industry if industry is available
        sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM accounts 
            WHERE name = $1 AND industry = $2
            "#
        )
        .bind(name)
        .bind(industry)
        .fetch_one(pool)
        .await?
    } else {
        // Use only name if industry is not available
        sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM accounts 
            WHERE name = $1
            "#
        )
        .bind(name)
        .fetch_one(pool)
        .await?
    };

    // Determine which fields were used for duplicate checking
    let duplicate_check_fields = if industry.is_some() {
        "Name + Industry".to_string()
    } else {
        "Name".to_string()
    };

    if existing_count > 0 {
        // Record already exists, skip insertion
        let fields_used = if industry.is_some() {
            format!("Name + Industry: {name} (Industry: {industry:?})")
        } else {
            format!("Name: {name}")
        };
        println!("Skipping duplicate account: {fields_used}");
        return Ok((InsertResult::Skipped, duplicate_check_fields));
    }

    let id = Uuid::new_v4();
    let now = Utc::now().naive_utc();
    
    // Set account type based on available data
    let account_type = if email.is_some() || phone.is_some() {
        Some("Customer")
    } else {
        Some("Prospect")
    };
    
    sqlx::query(
        r#"
        INSERT INTO accounts (
            id, name, account_type, industry, phone_office, website,
            date_entered, date_modified, created_by, modified_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#
    )
    .bind(id)
    .bind(name)
    .bind(account_type)
    .bind(industry)
    .bind(phone)
    .bind(website)
    .bind(now)
    .bind(now)
    .bind("csv-import") // Creator identifier
    .bind("csv-import") // Modifier identifier
    .execute(pool)
    .await?;

    Ok((InsertResult::Inserted, duplicate_check_fields))
}

async fn import_project_record_from_json(
    pool: &Pool<Postgres>,
    record: &HashMap<String, serde_json::Value>,
) -> Result<(InsertResult, String), Box<dyn std::error::Error>> {
    // Handle different field name formats for DemocracyLab vs other sources
    let raw_name = record.get("project_name")
        .and_then(|v| v.as_str())
        .or_else(|| record.get("name").and_then(|v| v.as_str()))
        .unwrap_or("Unknown");
    
    // Truncate name to fit database constraint (50 characters max)
    let name = if raw_name.len() > 50 {
        let truncated = &raw_name[..47]; // Leave room for "..."
        format!("{truncated}...")
    } else {
        raw_name.to_string()
    };
    
    let description = record.get("project_description")
        .and_then(|v| v.as_str())
        .or_else(|| record.get("description").and_then(|v| v.as_str()));

    // Check for existing record based on name
    let existing_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*) FROM projects 
        WHERE name = $1
        "#
    )
    .bind(&name)
    .fetch_one(pool)
    .await?;

    if existing_count > 0 {
        println!("Skipping duplicate project: {name}");
        return Ok((InsertResult::Skipped, "Name".to_string()));
    }

    let id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO projects (
            id, name, description, status,
            date_entered, date_modified, created_by, modified_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#
    )
    .bind(id)
    .bind(&name)
    .bind(description)
    .bind("Active") // Default status
    .bind(now)
    .bind(now)
    .bind("json-import")
    .bind("json-import")
    .execute(pool)
    .await?;

    Ok((InsertResult::Inserted, "Name".to_string()))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DemocracyLabApiResponse {
    pub projects: Vec<DemocracyLabProject>,
}

pub async fn import_democracylab_projects(
    pool: web::Data<std::sync::Arc<crate::ApiState>>,
    req: web::Json<DemocracyLabApiResponse>,
) -> Result<HttpResponse> {
    let db = match &pool.db {
        Some(db) => db,
        None => {
            return Ok(HttpResponse::ServiceUnavailable().json(ImportResponse {
                success: false,
                message: "Database not available. Server started without database connection.".to_string(),
                records_processed: Some(0),
                records_inserted: Some(0),
                records_skipped: Some(0),
                duplicate_check_columns: None,
                errors: vec!["Database connection not available".to_string()],
            }));
        }
    };
    
    let mut errors = Vec::new();
    let mut inserted_count = 0;
    let mut skipped_count = 0;
    let total_records = req.projects.len();

    for (index, project) in req.projects.iter().enumerate() {
        match insert_democracylab_project(db, project).await {
            Ok(InsertResult::Inserted) => inserted_count += 1,
            Ok(InsertResult::Skipped) => skipped_count += 1,
            Err(e) => {
                errors.push(format!("Row {}: {}", index + 1, e));
            }
        }
    }

    let message = if errors.is_empty() {
        if skipped_count > 0 {
            format!("Successfully imported {inserted_count} projects, skipped {skipped_count} duplicates")
        } else {
            format!("Successfully imported {inserted_count} projects")
        }
    } else {
        format!("Imported {} of {} projects with {} errors, skipped {} duplicates",
                inserted_count, total_records, errors.len(), skipped_count)
    };

    Ok(HttpResponse::Ok().json(ImportResponse {
        success: errors.is_empty() || inserted_count > 0,
        message,
        records_processed: Some(total_records),
        records_inserted: Some(inserted_count),
        records_skipped: Some(skipped_count),
        duplicate_check_columns: Some("Name".to_string()),
        errors,
    }))
}

async fn insert_democracylab_project(
    pool: &Pool<Postgres>,
    project: &DemocracyLabProject,
) -> Result<InsertResult, sqlx::Error> {
    // Check for existing record based on name
    let existing_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*) FROM projects
        WHERE name = $1
        "#
    )
    .bind(&project.name)
    .fetch_one(pool)
    .await?;

    if existing_count > 0 {
        println!("Skipping duplicate project: {}", &project.name);
        return Ok(InsertResult::Skipped);
    }

    let id = Uuid::new_v4();
    let now = Utc::now();

    let mut description_parts = Vec::new();
    if let Some(desc) = &project.description {
        description_parts.push(desc.clone());
    }
    if let Some(url) = &project.url {
        description_parts.push(format!("Project URL: {url}"));
    }
    let description = if description_parts.is_empty() {
        None
    } else {
        Some(description_parts.join("

"))
    };

    sqlx::query(
        r#"
        INSERT INTO projects (
            id, name, description, status,
            date_entered, date_modified, created_by, modified_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#
    )
    .bind(id)
    .bind(&project.name)
    .bind(&description)
    .bind("Active") // Default status
    .bind(now)
    .bind(now)
    .bind("democracylab-import")
    .bind("democracylab-import")
    .execute(pool)
    .await?;

    Ok(InsertResult::Inserted)
}