const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";

import { interceptPerformanceRoutes } from "../performance/helpers/e2e-performance-helpers";
import {
  durationRadioButton,
  openSidebarCacheStrategyForm,
  saveCacheStrategyForm,
} from "../performance/helpers/e2e-strategy-form-helpers";

import {
  BASE_POSTGRES_MIRROR_DB_INFO,
  DB_ROUTER_USERS,
  configurDbRoutingViaAPI,
  createDbWithIdentifierTable,
  createDestinationDatabasesViaAPI,
  signInAs,
} from "./helpers/e2e-database-routing-helpers";

const { ALL_USERS_GROUP, COLLECTION_GROUP } = USER_GROUPS;

const LEAD_DATABASE_ID = 3;

describe("admin > database > database routing", { tags: ["@external"] }, () => {
  before(() => {
    // For DB Routing it's important all the tables have the same schema
    createDbWithIdentifierTable({ dbName: "lead" });
    createDbWithIdentifierTable({ dbName: "destination_one" });
    createDbWithIdentifierTable({ dbName: "destination_two" });

    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.setTokenFeatures("all");
    Object.values(DB_ROUTER_USERS).forEach((user) => {
      // @ts-expect-error - this isn't typed yet
      cy.createUserFromRawData(user);
    });

    // With DB routing we only add the primary db directly
    // the other dbs get linked when they're added as destination dbs
    H.addPostgresDatabase("lead", false, "lead");
    configurDbRoutingViaAPI({
      router_database_id: LEAD_DATABASE_ID,
      user_attribute: "destination_database",
    });
    createDestinationDatabasesViaAPI({
      router_database_id: LEAD_DATABASE_ID,
      databases: [
        {
          ...BASE_POSTGRES_MIRROR_DB_INFO,
          name: "destination_one",
          details: {
            ...BASE_POSTGRES_MIRROR_DB_INFO.details,
            dbname: "destination_one",
          },
        },
        {
          ...BASE_POSTGRES_MIRROR_DB_INFO,
          name: "destination_two",
          details: {
            ...BASE_POSTGRES_MIRROR_DB_INFO.details,
            dbname: "destination_two",
          },
        },
      ],
    });
    H.snapshot("db-routing-3-dbs");
  });

  beforeEach(() => {
    H.restore("db-routing-3-dbs" as any);
    cy.signInAsAdmin();
  });

  it("should route users to the correct destination database", () => {
    H.createNativeQuestion({
      database: LEAD_DATABASE_ID,
      name: "Identifier Name",
      native: {
        query: "SELECT name FROM db_identifier;",
      },
    }).then(({ body: { id: questionId } }) => {
      // Test with userA
      cy.signOut();
      signInAs(DB_ROUTER_USERS.userA);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="name"]').should(
        "not.contain",
        "destination_two",
      );
      // Test with userB
      cy.signOut();
      signInAs(DB_ROUTER_USERS.userB);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_two");
      cy.get('[data-column-id="name"]').should(
        "not.contain",
        "destination_one",
      );

      // Test with user with wrong attribute value
      cy.signOut();
      signInAs(DB_ROUTER_USERS.userWrongAttribute);
      H.visitQuestion(questionId);
      cy.get('[data-testid="query-visualization-root"]').findByText(
        "No Mirror Database found for user attribute",
      );

      // Test with user with no attribute
      cy.signOut();
      signInAs(DB_ROUTER_USERS.userWrongAttribute);
      H.visitQuestion(questionId);
      cy.get('[data-testid="query-visualization-root"]').findByText(
        "No Mirror Database found for user attribute",
      );
    });
  });

  it("should not leak cached data", () => {
    H.createNativeQuestion({
      database: LEAD_DATABASE_ID,
      name: "Identifier Name",
      native: {
        query: "SELECT name FROM db_identifier;",
      },
    }).then(({ body: { id: questionId } }) => {
      interceptPerformanceRoutes();
      H.visitQuestion(questionId);
      openSidebarCacheStrategyForm("question");
      durationRadioButton().click();
      saveCacheStrategyForm({ strategyType: "duration", model: "database" });
      // Test with user a
      signInAs(DB_ROUTER_USERS.userA);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="name"]').should(
        "not.contain",
        "destination_two",
      );
      // Test with user b
      cy.signOut();
      signInAs(DB_ROUTER_USERS.userB);
      H.visitQuestion(questionId);
      cy.get('[data-column-id="name"]').should("contain", "destination_two");
      cy.get('[data-column-id="name"]').should(
        "not.contain",
        "destination_one",
      );
    });
  });

  it("should work with sandboxing", () => {
    H.createQuestion({
      name: "Color",
      database: LEAD_DATABASE_ID,
      query: {
        "source-table": 22,
      },
    }).then(({ body: { id: questionId } }) => {
      signInAs(DB_ROUTER_USERS.userA);
      cy.visit(`/question/${questionId}`);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="color"]').should("contain", "blue");
      cy.get('[data-column-id="color"]').should("contain", "red");

      cy.signInAsAdmin();
      H.blockUserGroupPermissions(ALL_USERS_GROUP, LEAD_DATABASE_ID);

      cy.visit(`admin/permissions/data/group/${COLLECTION_GROUP}/database/3`);
      H.modifyPermission("Db Identifier", 0, "Sandboxed");
      H.modal().findByText("Pick a column").click();
      H.popover().findByText("Color").click();
      H.modal().findByText("Pick a user attribute").click();
      H.popover().findByText("color").click();
      H.modal().button("Save").click();
      H.savePermissions();

      signInAs(DB_ROUTER_USERS.userA);
      cy.visit(`/question/${questionId}`);
      cy.get('[data-column-id="name"]').should("contain", "destination_one");
      cy.get('[data-column-id="color"]').should("contain", "blue");
      cy.get('[data-column-id="color"]').should("not.contain", "red");
    });
  });
});
