# forge-props-service

Simple Node.js microservice (and a command line tool) allowing custom sqlite queries over the property database of Autodesk Forge models.

While the Forge Model Derivative service does generate sqlite files as part of its model processing, the database creation
can sometimes fail, especially if the input design is too large or complex. To avoid that problem, this implementation downloads
the _objects\_*.json.gz_ files (property database format typicaly used by Forge Viewer) instead, and converts them
into a local sqlite file with the same schema:

![Database schema](./schema.svg)

The microservice then exposes an endpoint for executing custom SQL queries over the sqlite databases.

## Usage

### Microservice

Make the following requests to https://forge-props-service.herokuapp.com, or to your own deployment of this
sample app, providing an `Authorization` request header with a bearer token for accessing Autodesk Forge
with the `viewables:read` scope.

1. `POST /:urn` to start preparing the sqlite database for one of your Forge models
  - _:urn_ is a base64-encoded ID of the model
  - The sqlite database will be cached by the server, under the _cache_ folder
2. `GET /:urn` to check the status of the processing
  - If you see `{ "status": "running", ... }`, the database preparation is still in progress
  - If you see `{ "status": "failed", ...}`, the processing failed, and the JSON will include additonal information
  - If you see `{ "status": "complete", ...}`, you can move to the next step
3. `GET /:urn/properties[?q=<query>]` to query the property database
  - If the _q_ parameter is not provided, a default SQL query is used, listing the public properties of all objects
  - You can find a couple of query examples below
  - The database also provides a view called `properties` that combines all the tables and exposes all public properties

> Note that the demo deployment (https://forge-props-service.herokuapp.com) uses a free Heroku tier,
> and when it goes to sleep, all the cached sqlite files are lost.

### Command line

You can also generate the property database locally via scripts in the _bin_ folder.

- Install npm dependencies: `npm install`
- Run the _convert-local.js_ script to process a property database stored on a local filesystem:

```bash
convert-local.js <path to folder with input *.json.gz files> <path to output sqlite file>
```

- Or, run the _convert-forge.js_ script to process a property database of a model in Forge
(in this case you'll need to provide `FORGE_CLIENT_ID` and `FORGE_CLIENT_SECRET` env. variables
or a `FORGE_ACCESS_TOKEN` env. variable with a ready-to-use token):

```bash
export FORGE_CLIENT_ID=<client id>
export FORGE_CLIENT_SECRET=<client secret>
# or
export FORGE_ACCESS_TOKEN=<access token>

convert-forge.js <input model URN> <path to output sqlite file>
```

## Example queries

### Get all public properties

```sql
    SELECT ids.id AS dbid, attrs.category AS category, COALESCE(NULLIF(attrs.display_name, ''), attrs.name) AS name, vals.value AS value
    FROM _objects_eav eav
    LEFT JOIN _objects_id ids ON ids.id = eav.entity_id
    LEFT JOIN _objects_attr attrs ON attrs.id = eav.attribute_id
    LEFT JOIN _objects_val vals on vals.id = eav.value_id
    WHERE category NOT LIKE '\_\_%\_\_' ESCAPE '\' /* skip internal properties */
    ORDER BY dbid
```

Or using the pre-defined `properties` view:

```sql
    SELECT * FROM properties ORDER BY dbid
```

### Get all properties in the "Construction" category

```sql
    SELECT ids.id AS dbid, attrs.category AS category, COALESCE(NULLIF(attrs.display_name, ''), attrs.name) AS name, vals.value AS value
    FROM _objects_eav eav
    LEFT JOIN _objects_id ids ON ids.id = eav.entity_id
    LEFT JOIN _objects_attr attrs ON attrs.id = eav.attribute_id
    LEFT JOIN _objects_val vals on vals.id = eav.value_id
    WHERE category = 'Construction'
```

Or using the pre-defined `properties` view:

```sql
    SELECT * FROM properties WHERE category = 'Construction'
```

### Get the dbIDs of all children of dbID 123

```sql
    SELECT ids.id AS dbid, vals.value AS child_id
    FROM _objects_eav eav
    LEFT JOIN _objects_id ids ON ids.id = eav.entity_id
    LEFT JOIN _objects_attr attrs ON attrs.id = eav.attribute_id
    LEFT JOIN _objects_val vals on vals.id = eav.value_id
    WHERE dbid = 123 AND attrs.category = '__child__'
```

### Get the sum of all "Volume" property values

```sql
    SELECT SUM(vals.value) AS total_volume
    FROM _objects_eav eav
    LEFT JOIN _objects_id ids ON ids.id = eav.entity_id
    LEFT JOIN _objects_attr attrs ON attrs.id = eav.attribute_id
    LEFT JOIN _objects_val vals on vals.id = eav.value_id
    WHERE COALESCE(NULLIF(attrs.display_name, ''), attrs.name) = 'Volume'
```

Or using the pre-defined `properties` view:

```sql
    SELECT SUM(value) AS total_volume FROM properties WHERE name = 'Volume'
```
