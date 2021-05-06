# forge-props-service

Simple Node.js microservice allowing custom sqlite queries over the property database of Autodesk Forge models.

The service downloads _objects\_*.json.gz_ files (see https://github.com/wallabyway/propertyServer/blob/master/pipeline.md#property-pipeline
to learn more about those) of the input Forge model and converts them into a local sqlite file. The sqlite database can then queried
through a specific endpoint.

## Usage

- Install npm dependencies: `npm install`
- Start the server: `npm start`

> Each of the HTTP requests listed below require that you include an `Authorization` header with a bearer token
> that can access the Forge Model Derivative service (only the `viewables:read` scope is neeeded).

1. Make a POST request to `/:urn` to start preparing the sqlite database for one of your Forge models
  - _:urn_ is a base64-encoded ID of the model
  - The sqlite database will be cached locally, under the _cache_ folder
2. Make a GET request to `/:urn` to check the status of the sqlite processing
  - If you see `{ "status": "running", ... }`, the database preparation is still in progress
  - If you see `{ "status": "failed", ...}`, the processing failed, and the JSON will include additonal information
  - If you see `{ "status": "complete", ...}`, you can move to the next step
3. Make a GET request to `/:urn/properties[?q=<query>]` to query the property database
  - If the _q_ parameter is not provided, a default SQL query is used, listing properties of all objects
  - You can access the following tables in the query: `objects_attrs`, `objects_avs`, `objects_ids`, and `objects_vals`

Here's some query examples:

### Get all public properties

```sql
    SELECT ids.ent_id AS dbid, attrs.category AS prop_category, attrs.name AS prop_name, vals.value AS prop_value
    FROM objects_avs avs
    LEFT JOIN objects_ids ids ON ids.ent_id = avs.ent_id
    LEFT JOIN objects_attrs attrs ON attrs.attr_id = avs.attr_id
    LEFT JOIN objects_vals vals on vals.val_id = avs.val_id
    WHERE prop_category NOT LIKE '\_\_%\_\_' ESCAPE '\' /* skip internal properties */
    ORDER BY dbid
```

### Get all properties in the "Construction" category

```sql
    SELECT ids.ent_id AS dbid, attrs.category AS prop_category, attrs.name AS prop_name, vals.value AS prop_value
    FROM objects_avs avs
    LEFT JOIN objects_ids ids ON ids.ent_id = avs.ent_id
    LEFT JOIN objects_attrs attrs ON attrs.attr_id = avs.attr_id
    LEFT JOIN objects_vals vals on vals.val_id = avs.val_id
    WHERE prop_category = 'Construction'
    ORDER BY dbid
```

### Get the dbIDs of all children of dbID 123

```sql
    SELECT ids.ent_id AS dbid, vals.value AS child_id
    FROM objects_avs avs
    LEFT JOIN objects_ids ids ON ids.ent_id = avs.ent_id
    LEFT JOIN objects_attrs attrs ON attrs.attr_id = avs.attr_id
    LEFT JOIN objects_vals vals on vals.val_id = avs.val_id
    WHERE dbid = 123 AND attrs.category = '__child__'
```

### Get the sum of all "Area" property values

```sql
    SELECT SUM(vals.value)
    FROM objects_avs avs
    LEFT JOIN objects_ids ids ON ids.ent_id = avs.ent_id
    LEFT JOIN objects_attrs attrs ON attrs.attr_id = avs.attr_id
    LEFT JOIN objects_vals vals on vals.val_id = avs.val_id
    WHERE attrs.name = 'Area'
```