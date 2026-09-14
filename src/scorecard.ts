import { Finding } from "./apiConnector";

export type Grade = "A+" | "B" | "C" | "F";

export interface ScorecardResult {
  grade: Grade;
  score: number;
  label: string;
  gradient: string;
  shadowColor: string;
  textColor: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  total: number;
}

export function calculateScorecard(findings: Finding[]): ScorecardResult {
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const f of findings) {
    switch (f.severity) {
      case "CRITICAL":
        criticalCount++;
        break;
      case "HIGH":
        highCount++;
        break;
      case "MEDIUM":
        mediumCount++;
        break;
      case "LOW":
        lowCount++;
        break;
    }
  }

  const total = findings.length;

  // Deduct points from 100 base score
  let score = 100 - (criticalCount * 30 + highCount * 18 + mediumCount * 8 + lowCount * 3);
  score = Math.max(0, Math.min(100, score));

  let grade: Grade;
  let label: string;
  let gradient: string;
  let shadowColor: string;
  let textColor: string;

  if (total === 0) {
    grade = "A+";
    label = "SECURE & CLEAN";
    gradient = "linear-gradient(135deg, #00F5A0 0%, #00D9F6 100%)";
    shadowColor = "rgba(0, 245, 160, 0.4)";
    textColor = "#0B2B1B";
  } else if (criticalCount === 0 && highCount === 0 && total <= 2) {
    grade = "B";
    label = "MINOR RISKS DETECTED";
    gradient = "linear-gradient(135deg, #FFD200 0%, #F7971E 100%)";
    shadowColor = "rgba(255, 210, 0, 0.4)";
    textColor = "#3D2B00";
  } else if (criticalCount === 0 && total <= 5) {
    grade = "C";
    label = "MODERATE RISKS DETECTED";
    gradient = "linear-gradient(135deg, #FF512F 0%, #DD2476 100%)";
    shadowColor = "rgba(255, 81, 47, 0.4)";
    textColor = "#FFFFFF";
  } else {
    grade = "F";
    label = "CRITICAL SECURITY THREATS";
    gradient = "linear-gradient(135deg, #FF0055 0%, #7928CA 100%)";
    shadowColor = "rgba(255, 0, 85, 0.5)";
    textColor = "#FFFFFF";
  }

  return {
    grade,
    score,
    label,
    gradient,
    shadowColor,
    textColor,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    total,
  };
}

export function getOwaspUrl(finding: Finding): string {
  const text = `${finding.title} ${finding.category ?? ""} ${finding.rule_id}`.toLowerCase();
  
  if (text.includes("sql") || text.includes("sqli")) {
    return "https://owasp.org/www-community/attacks/SQL_Injection";
  }
  if (text.includes("xss") || text.includes("scripting")) {
    return "https://owasp.org/www-community/attacks/xss/";
  }
  if (text.includes("secret") || text.includes("key") || text.includes("password") || text.includes("credential")) {
    return "https://owasp.org/www-project-top-ten/2021/A07_2021-Identification_and_Authentication_Failures/";
  }
  if (text.includes("rce") || text.includes("command") || text.includes("exec") || text.includes("injection")) {
    return "https://owasp.org/www-community/attacks/Command_Injection";
  }
  if (text.includes("path") || text.includes("traversal") || text.includes("lfi")) {
    return "https://owasp.org/www-community/attacks/Path_Traversal";
  }
  if (text.includes("ssrf")) {
    return "https://owasp.org/www-community/attacks/Server_Side_Request_Forgery";
  }
  if (text.includes("csrf")) {
    return "https://owasp.org/www-community/attacks/csrf";
  }
  if (text.includes("auth") || text.includes("jwt") || text.includes("token")) {
    return "https://owasp.org/www-project-top-ten/2021/A01_2021-Broken_Access_Control/";
  }
  
  return "https://owasp.org/www-project-top-ten/";
}
