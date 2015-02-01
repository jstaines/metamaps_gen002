Metamaps.Backbone = {};
Metamaps.Backbone.Map = Backbone.Model.extend({
    urlRoot: '/maps',
    blacklist: ['created_at', 'updated_at', 'created_at_clean', 'updated_at_clean', 'user_name', 'contributor_count', 'topic_count', 'synapse_count', 'topics', 'synapses', 'mappings', 'mappers'],
    toJSON: function (options) {
        return _.omit(this.attributes, this.blacklist);
    },
    save: function (key, val, options) {
        
        var attrs;

        // Handle both `"key", value` and `{key: value}` -style arguments.
        if (key == null || typeof key === 'object') {
            attrs = key;
            options = val;
        } else {
            (attrs = {})[key] = val;
        }

        var newOptions = options || {};
        var s = newOptions.success;

        newOptions.success = function (model, response, opt) {
            if (s) s(model, response, opt);
            model.trigger('saved');
        };
        return Backbone.Model.prototype.save.call(this, attrs, newOptions);
    },
    initialize: function () {
        this.on('changeByOther', this.updateView);
        this.on('saved', this.savedEvent);
    },
    savedEvent: function() {
        Metamaps.Realtime.sendMapChange(this);
    },
    authorizeToEdit: function (mapper) {
        if (mapper && (this.get('permission') === "commons" || this.get('user_id') === mapper.get('id'))) return true;
        else return false;
    },
    authorizePermissionChange: function (mapper) {
        if (mapper && this.get('user_id') === mapper.get('id')) return true;
        else return false;
    },
    getUser: function () {
        return Metamaps.Mapper.get(this.get('user_id'));
    },
    fetchContained: function () {
        var bb = Metamaps.Backbone;
        var that = this;
        var start = function (data) {
            that.set('mappers', new bb.MapperCollection(data.mappers));
            that.set('topics', new bb.TopicCollection(data.topics));
            that.set('synapses', new bb.SynapseCollection(data.synapses));
            that.set('mappings', new bb.MappingCollection(data.mappings));
        };

        var e = $.ajax({
            url: "/maps/" + this.id + "/contains.json",
            success: start,
            error: errorFunc,
            async: false
        });
    },
    getTopics: function () {
        if (!this.get('topics')) {
            this.fetchContained();
        }
        return this.get('topics');
    },
    getSynapses: function () {
        if (!this.get('synapses')) {
            this.fetchContained();
        }
        return this.get('synapses');
    },
    getMappings: function () {
        if (!this.get('mappings')) {
            this.fetchContained();
        }
        return this.get('mappings');
    },
    getMappers: function () {
        if (!this.get('mappers')) {
            this.fetchContained();
        }
        return this.get('mappers');
    },
    attrForCards: function () {
        function capitalize(string) {
            return string.charAt(0).toUpperCase() + string.slice(1);
        }

        var n = this.get('name');
        var d = this.get('desc');

        var maxNameLength = 32;
        var maxDescLength = 118;
        var truncatedName = n ? (n.length > maxNameLength ? n.substring(0, maxNameLength) + "..." : n) : "";
        var truncatedDesc = d ? (d.length > maxDescLength ? d.substring(0, maxDescLength) + "..." : d) : "";

        var obj = {
            id: this.id,
            name: truncatedName,
            fullName: n,
            desc: truncatedDesc,
            permission: this.get("permission") ? capitalize(this.get("permission")) : "Commons",
            editPermission: this.authorizeToEdit(Metamaps.Active.Mapper) ? 'canEdit' : 'cannotEdit',
            contributor_count_number: '<span class="cCountColor">' + this.get('contributor_count') + '</span>',
            contributor_count_string: this.get('contributor_count') == 1 ? ' contributor' : ' contributors',
            topic_count_number: '<span class="tCountColor">' + this.get('topic_count') + '</span>',
            topic_count_string: this.get('topic_count')  == 1 ? ' topic' : ' topics',
            synapse_count_number: '<span class="sCountColor">' + this.get('synapse_count') + '</span>',
            synapse_count_string: this.get('synapse_count') == 1 ? ' synapse' : ' synapses',
            screenshot: '<img src="' + this.get('screenshot_url') + '" />'
        };
        return obj;
    },
    updateView: function() {
        var map = Metamaps.Active.Map;
        var isActiveMap = this.id === map.id;
        var authorized = map && map.authorizeToEdit(Metamaps.Active.Mapper) ? 'canEditMap' : '';
        var commonsMap = map && map.get('permission') === 'commons' ? 'commonsMap' : '';
        if (isActiveMap) {
            Metamaps.Map.InfoBox.updateNameDescPerm(this.get('name'), this.get('desc'), this.get('permission'));
            this.updateMapWrapper();
        }
    },
    updateMapWrapper: function() {
        var map = Metamaps.Active.Map;
        var isActiveMap = this.id === map.id;
        var authorized = map && map.authorizeToEdit(Metamaps.Active.Mapper) ? 'canEditMap' : '';
        var commonsMap = map && map.get('permission') === 'commons' ? 'commonsMap' : '';
        if (isActiveMap) {
            $('.wrapper').removeClass('canEditMap commonsMap').addClass(authorized + ' ' + commonsMap);
        }
    }
});
Metamaps.Backbone.MapsCollection = Backbone.Collection.extend({
    model: Metamaps.Backbone.Map,
    initialize: function(models, options) {
        this.id = options.id;
        this.sortBy = options.sortBy;

        if (options.mapperId) {
            this.mapperId = options.mapperId;
        }

        // this.page represents the NEXT page to fetch
        this.page = models.length > 0 ? (models.length < 20 ? "loadedAll" : 2) : 1;
    },
    url: function() {
        if (!this.mapperId) {
            return '/explore/' + this.id + '.json';
        }
        else {
            return '/explore/mapper/' + this.mapperId + '.json';
        }
    },
    comparator: function (a, b) {
        a = a.get(this.sortBy);
        b = b.get(this.sortBy);
        var temp;
        if (this.sortBy === 'name') {
            a = a ? a.toLowerCase() : "";
            b = b ? b.toLowerCase() : "";
        }
        else {
            // this is for updated_at and created_at
            temp = a;
            a = b;
            b = temp;
            a = (new Date(a)).getTime();
            b = (new Date(b)).getTime();
        }
        return a > b ? 1 : a < b ? -1 : 0;
    },
    getMaps: function (cb) {

        var self = this;

        Metamaps.Loading.show();

        if (this.page != "loadedAll") {
            var numBefore = this.length;
            this.fetch({
                remove: false,
                silent: true,
                data: { page: this.page },
                success: function (collection, response, options) {
                    // you can pass additional options to the event you trigger here as well
                    if (collection.length - numBefore < 20) {
                        self.page = "loadedAll";
                    }
                    else self.page += 1;
                    self.trigger('successOnFetch', cb);
                },
                error: function (collection, response, options) {
                    // you can pass additional options to the event you trigger here as well
                    self.trigger('errorOnFetch');
                }
            });
        }
        else {
            self.trigger('successOnFetch', cb);
        }
    }
});

Metamaps.Backbone.Mapper = Backbone.Model.extend({
    urlRoot: '/users',
    blacklist: ['created_at', 'updated_at'],
    toJSON: function (options) {
        return _.omit(this.attributes, this.blacklist);
    },
    prepareLiForFilter: function () {
        var li = '';
        li += '<li data-id="' + this.id.toString() + '">';      
        li += '<img src="' + this.get("image") + '" data-id="' + this.id.toString() + '"';
        li += ' alt="' + this.get('name') + '" />';      
        li += '<p>' + this.get('name') + '</p></li>';
        return li;
    }
});
Metamaps.Backbone.MapperCollection = Backbone.Collection.extend({
    model: Metamaps.Backbone.Mapper,
    url: '/users'
});